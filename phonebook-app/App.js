import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import CallLogs from 'react-native-call-log';
import { toCSV, fromCSV } from './utils/csv';

const STORAGE_KEY = 'phonebook_contacts_v1';
const BACKUP_DIR_KEY = 'phonebook_backup_dir_v1';
const BACKUP_FILE_NAME = 'phonebook_backup.csv';

const BLUE = '#007AFF';
const BG = '#FFFFFF';
const TEXT = '#1C1C1E';
const SUBTLE = '#8E8E93';
const DIVIDER = '#E5E5EA';

function normalizePhone(p) {
  const digits = String(p || '').replace(/\D/g, '');
  return digits.slice(-10);
}

export default function App() {
  const [contacts, setContacts] = useState([]);
  const [query, setQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState('contacts');
  const [backupDirUri, setBackupDirUri] = useState(null);
  const [callLogData, setCallLogData] = useState([]);
  const [callLogLoading, setCallLogLoading] = useState(false);

  // load contacts + backup dir on start
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

  // save contacts + auto backup on every change
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(contacts)).catch(() => {});
    if (backupDirUri) {
      writeBackup(backupDirUri, contacts).catch(() => {});
    }
  }, [contacts, loaded]);

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
  }

  function addContact(prefillName, prefillPhone) {
    const trimmedName = (prefillName ?? name).trim();
    const trimmedPhone = (prefillPhone ?? phone).trim();
    if (!trimmedName || !trimmedPhone) {
      Alert.alert('Missing info', 'Enter name and phone number.');
      return;
    }
    const newContact = {
      id: Date.now().toString(),
      name: trimmedName,
      phone: trimmedPhone,
      favorite: false,
    };
    setContacts((prev) => [...prev, newContact]);
    resetForm();
    setModalVisible(false);
  }

  function toggleFavorite(id) {
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, favorite: !c.favorite } : c))
    );
  }

  function deleteContact(id) {
    Alert.alert('Delete contact', 'Remove this contact?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => setContacts((prev) => prev.filter((c) => c.id !== id)),
      },
    ]);
  }

  function callNumber(number) {
    Linking.openURL(`tel:${number}`).catch(() => {
      Alert.alert('Error', 'Could not open dialer.');
    });
  }

  // ---------- Backup (CSV, Obsidian-style folder) ----------

  async function writeBackup(dirUri, contactsList) {
    try {
      const csv = toCSV(contactsList);
      const existing = await FileSystem.StorageAccessFramework.readDirectoryAsync(dirUri);
      const existingFile = existing.find((uri) => uri.includes(BACKUP_FILE_NAME));
      let fileUri = existingFile;
      if (!fileUri) {
        fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
          dirUri,
          BACKUP_FILE_NAME,
          'text/csv'
        );
      }
      await FileSystem.writeAsStringAsync(fileUri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch (e) {
      // silent fail for auto-backup; manual backup shows alert
      throw e;
    }
  }

  async function pickBackupFolder() {
    try {
      const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!perm.granted) return;
      setBackupDirUri(perm.directoryUri);
      await AsyncStorage.setItem(BACKUP_DIR_KEY, perm.directoryUri);
      Alert.alert('Folder set', 'Backups will save here automatically.');
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
      await writeBackup(backupDirUri, contacts);
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
            onPress: () => setContacts((prev) => [...prev, ...imported]),
          },
          {
            text: 'Replace',
            style: 'destructive',
            onPress: () => setContacts(imported),
          },
        ]
      );
    } catch (e) {
      Alert.alert('Import failed', 'Could not read CSV file.');
    }
  }

  // ---------- Call log ----------

  const loadCallLog = useCallback(async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Not supported', 'Call log is Android only.');
      return;
    }
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
        Alert.alert('Permission denied', 'Cannot show call log without permission.');
        setCallLogLoading(false);
        return;
      }
      const logs = await CallLogs.load(100);
      setCallLogData(logs || []);
    } catch (e) {
      Alert.alert('Error', 'Could not load call log.');
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

  function suggestAddFromCallLog(rawNumber, suggestedName) {
    setName(suggestedName || '');
    setPhone(rawNumber);
    setModalVisible(true);
  }

  // ---------- Render helpers ----------

  function renderContactRow({ item }) {
    return (
      <TouchableOpacity
        style={styles.row}
        onLongPress={() => deleteContact(item.id)}
        activeOpacity={0.6}
      >
        <TouchableOpacity onPress={() => callNumber(item.phone)} style={{ flex: 1 }}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.phone}>{item.phone}</Text>
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
            onPress={() => suggestAddFromCallLog(item.phoneNumber, item.name)}
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      <Text style={styles.title}>Phonebook</Text>

      <View style={styles.tabBar}>
        {['contacts', 'calls', 'settings'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'contacts' ? 'Contacts' : tab === 'calls' ? 'Calls' : 'Settings'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

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
          <TouchableOpacity
            style={styles.fab}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.fabText}>+</Text>
          </TouchableOpacity>
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

      {activeTab === 'settings' && (
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

          <Text style={styles.settingsNote}>
            Auto-backup runs after every add or delete, once a folder is set.
          </Text>
        </View>
      )}

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Contact</Text>
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
              <TouchableOpacity onPress={() => addContact()} style={styles.saveBtn}>
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: TEXT,
    marginBottom: 12,
    letterSpacing: 0.2,
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
    marginLeft: 12,
  },
  starActive: {
    color: '#FFB000',
  },
  callIcon: {
    fontSize: 20,
    marginLeft: 12,
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
  settingsWrap: {
    paddingTop: 8,
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
