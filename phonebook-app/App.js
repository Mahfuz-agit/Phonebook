import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  StyleSheet,
  StatusBar,
  Platform,
  PermissionsAndroid,
  Linking,
  Animated,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import CallLogs from 'react-native-call-log';
import { fromCSV } from './utils/csv';
import { writeMainBackup, appendDeletedContact } from './utils/backup';
import { loadActivityLog, addActivityEntry, formatLogTime } from './utils/activityLog';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const STORAGE_KEY = 'phonebook_contacts_v1';
const BACKUP_DIR_KEY = 'phonebook_backup_dir_v1';

const BLUE = '#007AFF';
const BG = '#FFFFFF';
const TEXT = '#1C1C1E';
const SUBTLE = '#8E8E93';
const DIVIDER = '#E5E5EA';
const RED = '#FF3B30';

function normalizePhone(p) {
  const digits = String(p || '').replace(/\D/g, '');
  return digits.slice(-10);
}

function smoothNext() {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

// ---------- Slide-in panel (iOS push feel) ----------
function SlidePanel({ visible, onClose, children }) {
  const translateX = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    Animated.spring(translateX, {
      toValue: visible ? 0 : 400,
      useNativeDriver: true,
      speed: 16,
      bounciness: 4,
    }).start();
  }, [visible]);

  if (!visible && translateX.__getValue && translateX.__getValue() >= 400) {
    // fully off-screen and hidden -> don't render heavy content
  }

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.slidePanel,
        { transform: [{ translateX }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export default function App() {
  const [contacts, setContacts] = useState([]);
  const [query, setQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState('contacts');
  const [backupDirUri, setBackupDirUri] = useState(null);
  const [callLogData, setCallLogData] = useState([]);
  const [callLogLoading, setCallLogLoading] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [activityVisible, setActivityVisible] = useState(false);
  const [activityLog, setActivityLog] = useState([]);

  const tabFade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setContacts(JSON.parse(raw));
        const dir = await AsyncStorage.getItem(BACKUP_DIR_KEY);
        if (dir) setBackupDirUri(dir);
      } catch (e) {
        // start empty
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(contacts)).catch(() => {});
    if (backupDirUri) {
      writeMainBackup(backupDirUri, contacts).catch(() => {});
    }
  }, [contacts, loaded]);

  function fadeTabSwitch(nextTab) {
    Animated.sequence([
      Animated.timing(tabFade, { toValue: 0, duration: 100, useNativeDriver: true }),
    ]).start(() => {
      setActiveTab(nextTab);
      Animated.timing(tabFade, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = contacts;
    if (q) {
      list = contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [contacts, query]);

  function resetForm() {
    setName('');
    setPhone('');
    setEditingId(null);
  }

  function openAddModal(prefillName, prefillPhone) {
    setEditingId(null);
    setName(prefillName || '');
    setPhone(prefillPhone || '');
    setModalVisible(true);
  }

  function openEditModal(contact) {
    setEditingId(contact.id);
    setName(contact.name);
    setPhone(contact.phone);
    setModalVisible(true);
  }

  async function saveContact() {
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName || !trimmedPhone) {
      Alert.alert('Missing info', 'Enter name and phone number.');
      return;
    }
    smoothNext();
    if (editingId) {
      let before = null;
      setContacts((prev) =>
        prev.map((c) => {
          if (c.id === editingId) {
            before = c;
            return { ...c, name: trimmedName, phone: trimmedPhone };
          }
          return c;
        })
      );
      addActivityEntry('edit', { name: trimmedName, phone: trimmedPhone }, before ? `was: ${before.name}, ${before.phone}` : null);
    } else {
      const newContact = {
        id: Date.now().toString(),
        name: trimmedName,
        phone: trimmedPhone,
        favorite: false,
      };
      setContacts((prev) => [...prev, newContact]);
      addActivityEntry('add', newContact);
    }
    resetForm();
    setModalVisible(false);
  }

  function toggleFavorite(id) {
    smoothNext();
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, favorite: !c.favorite } : c))
    );
  }

  function deleteContact(contact) {
    Alert.alert('Delete contact', `Remove ${contact.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          smoothNext();
          setContacts((prev) => prev.filter((c) => c.id !== contact.id));
          addActivityEntry('delete', contact);
          if (backupDirUri) {
            appendDeletedContact(backupDirUri, contact).catch(() => {});
          }
        },
      },
    ]);
  }

  function callNumber(number) {
    Linking.openURL(`tel:${number}`).catch(() => {
      Alert.alert('Error', 'Could not open dialer.');
    });
  }

  // ---------- Backup / restore ----------

  async function pickBackupFolder() {
    try {
      const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!perm.granted) return;
      setBackupDirUri(perm.directoryUri);
      await AsyncStorage.setItem(BACKUP_DIR_KEY, perm.directoryUri);
      Alert.alert('Folder set', 'Backups (and deleted contacts) will save here.');
    } catch (e) {
      Alert.alert('Error', 'Could not set backup folder.');
    }
  }

  async function backupNow() {
    if (!backupDirUri) {
      Alert.alert('No folder set', 'Pick a backup folder first.');
      return;
    }
    try {
      await writeMainBackup(backupDirUri, contacts);
      Alert.alert('Backup done', 'Contacts saved to CSV.');
    } catch (e) {
      Alert.alert('Backup failed', 'Could not write CSV file.');
    }
  }

  async function restoreFromCSV() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const fileUri = result.assets[0].uri;
      const text = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const imported = fromCSV(text);
      if (imported.length === 0) {
        Alert.alert('Empty file', 'No contacts found in this CSV.');
        return;
      }
      Alert.alert(
        'Restore contacts',
        `Found ${imported.length} contacts. Replace current list?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Merge',
            onPress: () => {
              smoothNext();
              setContacts((prev) => [...prev, ...imported]);
            },
          },
          {
            text: 'Replace',
            style: 'destructive',
            onPress: () => {
              smoothNext();
              setContacts(imported);
            },
          },
        ]
      );
    } catch (e) {
      Alert.alert('Import failed', 'Could not read CSV file.');
    }
  }

  // ---------- Call log ----------

  const loadCallLog = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    setCallLogLoading(true);
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
        {
          title: 'Call log access',
          message: 'Needed to show your recent calls.',
          buttonPositive: 'Allow',
        }
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        setCallLogLoading(false);
        return;
      }
      const logs = await CallLogs.load(100);
      setCallLogData(logs || []);
    } catch (e) {
      // ignore
    } finally {
      setCallLogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'calls') {
      loadCallLog();
    }
  }, [activeTab, loadCallLog]);

  function findContactForNumber(rawNumber) {
    const norm = normalizePhone(rawNumber);
    if (!norm) return null;
    return contacts.find((c) => normalizePhone(c.phone) === norm) || null;
  }

  // ---------- Activity log ----------

  async function openActivityLog() {
    const log = await loadActivityLog();
    setActivityLog(log);
    setActivityVisible(true);
  }

  async function refreshActivityAfterChange() {
    const log = await loadActivityLog();
    setActivityLog(log);
  }

  // keep activity list fresh whenever contacts changes while panel open
  useEffect(() => {
    if (activityVisible) refreshActivityAfterChange();
  }, [contacts]);

  // ---------- Renderers ----------

  function renderContactRow({ item }) {
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => openEditModal(item)}
        onLongPress={() => deleteContact(item)}
        activeOpacity={0.6}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.phone}>{item.phone}</Text>
        </View>
        <TouchableOpacity onPress={() => callNumber(item.phone)} hitSlop={10} style={{ marginRight: 14 }}>
          <Text style={styles.callIcon}>📞</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => toggleFavorite(item.id)} hitSlop={10}>
          <Text style={[styles.star, item.favorite && styles.starActive]}>
            {item.favorite ? '★' : '☆'}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  function renderCallLogRow({ item, index }) {
    const contact = findContactForNumber(item.phoneNumber);
    const displayName = contact ? contact.name : item.name || 'Unknown';
    const isUnknown = !contact;
    return (
      <View style={styles.callRow} key={index}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.phone}>
            {item.phoneNumber}  ·  {item.type}
          </Text>
        </View>
        {isUnknown ? (
          <TouchableOpacity
            style={styles.addSmallBtn}
            onPress={() => openAddModal(item.name, item.phoneNumber)}
          >
            <Text style={styles.addSmallBtnText}>Add</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => callNumber(item.phoneNumber)} hitSlop={10}>
            <Text style={styles.callIcon}>📞</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  function renderActivityRow({ item }) {
    const label = item.action === 'add' ? 'Added' : item.action === 'delete' ? 'Deleted' : 'Edited';
    const color = item.action === 'delete' ? RED : item.action === 'add' ? BLUE : SUBTLE;
    return (
      <View style={styles.activityRow}>
        <View style={[styles.activityDot, { backgroundColor: color }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>
            {label} · {item.name || 'Unknown'}
          </Text>
          <Text style={styles.phone}>{item.phone}</Text>
          <Text style={styles.activityTime}>{formatLogTime(item.timestamp)}</Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <View style={styles.header}>
        <Text style={styles.title}>Phonebook</Text>
        <TouchableOpacity
          onPress={() => setSettingsVisible(true)}
          hitSlop={12}
          style={styles.gearBtn}
        >
          <Text style={styles.gearIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        {['contacts', 'calls'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
            onPress={() => fadeTabSwitch(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'contacts' ? 'Contacts' : 'Calls'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Animated.View style={{ flex: 1, opacity: tabFade }}>
        {activeTab === 'contacts' && (
          <>
            <TextInput
              style={styles.search}
              placeholder="Search"
              placeholderTextColor={SUBTLE}
              value={query}
              onChangeText={setQuery}
              clearButtonMode="while-editing"
              autoCorrect={false}
            />
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              renderItem={renderContactRow}
              ItemSeparatorComponent={() => <View style={styles.divider} />}
              ListEmptyComponent={
                <Text style={styles.empty}>
                  {contacts.length === 0 ? 'No contacts yet.' : 'No matches.'}
                </Text>
              }
              contentContainerStyle={filtered.length === 0 && { flex: 1 }}
            />
          </>
        )}

        {activeTab === 'calls' && (
          <FlatList
            data={callLogData}
            keyExtractor={(item, idx) => String(item.timestamp) + idx}
            renderItem={renderCallLogRow}
            ItemSeparatorComponent={() => <View style={styles.divider} />}
            refreshing={callLogLoading}
            onRefresh={loadCallLog}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {callLogLoading ? 'Loading...' : 'No call log data. Pull to refresh.'}
              </Text>
            }
            contentContainerStyle={callLogData.length === 0 && { flex: 1 }}
          />
        )}
      </Animated.View>

      {activeTab === 'contacts' && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => openAddModal()}
          activeOpacity={0.8}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      {/* Add / Edit contact modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          resetForm();
          setModalVisible(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editingId ? 'Edit Contact' : 'New Contact'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor={SUBTLE}
              value={name}
              onChangeText={setName}
              autoFocus
            />
            <TextInput
              style={styles.input}
              placeholder="Phone number"
              placeholderTextColor={SUBTLE}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => {
                  resetForm();
                  setModalVisible(false);
                }}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveContact} style={styles.saveBtn}>
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Settings slide panel (iOS push feel, top-right gear) */}
      <SlidePanel visible={settingsVisible} onClose={() => setSettingsVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
          <View style={styles.panelHeader}>
            <TouchableOpacity onPress={() => setSettingsVisible(false)} hitSlop={12}>
              <Text style={styles.panelBack}>‹ Back</Text>
            </TouchableOpacity>
            <Text style={styles.panelTitle}>Settings</Text>
            <View style={{ width: 50 }} />
          </View>

          <View style={styles.settingsWrap}>
            <Text style={styles.settingsLabel}>Backup folder</Text>
            <Text style={styles.settingsValue}>
              {backupDirUri ? 'Folder set ✓' : 'Not set'}
            </Text>
            <TouchableOpacity style={styles.settingsBtn} onPress={pickBackupFolder}>
              <Text style={styles.settingsBtnText}>
                {backupDirUri ? 'Change backup folder' : 'Choose backup folder'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.settingsBtn} onPress={backupNow}>
              <Text style={styles.settingsBtnText}>Backup now (CSV)</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.settingsBtn} onPress={restoreFromCSV}>
              <Text style={styles.settingsBtnText}>Restore from CSV</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.settingsBtn} onPress={openActivityLog}>
              <Text style={styles.settingsBtnText}>Activity log</Text>
            </TouchableOpacity>

            <Text style={styles.settingsNote}>
              Auto-backup runs after every add, edit, or delete, once a folder is set.
              Deleted contacts are saved separately in a "deleted" subfolder.
            </Text>
          </View>
        </SafeAreaView>
      </SlidePanel>

      {/* Activity log slide panel */}
      <SlidePanel visible={activityVisible} onClose={() => setActivityVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
          <View style={styles.panelHeader}>
            <TouchableOpacity onPress={() => setActivityVisible(false)} hitSlop={12}>
              <Text style={styles.panelBack}>‹ Settings</Text>
            </TouchableOpacity>
            <Text style={styles.panelTitle}>Activity Log</Text>
            <View style={{ width: 70 }} />
          </View>
          <FlatList
            data={activityLog}
            keyExtractor={(item) => item.id}
            renderItem={renderActivityRow}
            ItemSeparatorComponent={() => <View style={styles.divider} />}
            ListEmptyComponent={<Text style={styles.empty}>No activity yet.</Text>}
            contentContainerStyle={[{ paddingHorizontal: 20 }, activityLog.length === 0 && { flex: 1 }]}
          />
        </SafeAreaView>
      </SlidePanel>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 24 : 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: TEXT,
    letterSpacing: 0.2,
  },
  gearBtn: {
    padding: 4,
  },
  gearIcon: {
    fontSize: 24,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    color: SUBTLE,
    fontWeight: '600',
  },
  tabTextActive: {
    color: TEXT,
  },
  search: {
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: TEXT,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  callRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  name: {
    fontSize: 17,
    fontWeight: '600',
    color: TEXT,
  },
  phone: {
    fontSize: 14,
    color: SUBTLE,
    marginTop: 2,
  },
  star: {
    fontSize: 22,
    color: DIVIDER,
  },
  starActive: {
    color: '#FFB000',
  },
  callIcon: {
    fontSize: 20,
  },
  addSmallBtn: {
    backgroundColor: BLUE,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addSmallBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: DIVIDER,
  },
  empty: {
    flex: 1,
    textAlign: 'center',
    textAlignVertical: 'center',
    color: SUBTLE,
    fontSize: 15,
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 32,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '400',
    marginTop: -2,
  },
  slidePanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: BG,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: DIVIDER,
  },
  panelBack: {
    color: BLUE,
    fontSize: 16,
  },
  panelTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: TEXT,
  },
  settingsWrap: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  settingsLabel: {
    fontSize: 13,
    color: SUBTLE,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  settingsValue: {
    fontSize: 16,
    color: TEXT,
    marginBottom: 16,
  },
  settingsBtn: {
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  settingsBtnText: {
    color: BLUE,
    fontSize: 16,
    fontWeight: '600',
  },
  settingsNote: {
    fontSize: 13,
    color: SUBTLE,
    marginTop: 8,
    lineHeight: 18,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    marginRight: 10,
  },
  activityTime: {
    fontSize: 12,
    color: SUBTLE,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: BG,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: TEXT,
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: TEXT,
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  cancelText: {
    color: SUBTLE,
    fontSize: 16,
  },
  saveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: BLUE,
    borderRadius: 10,
    marginLeft: 8,
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
