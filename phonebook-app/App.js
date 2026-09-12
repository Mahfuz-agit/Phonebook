import React, { useState, useEffect, useMemo } from 'react';
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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'phonebook_contacts_v1';
const BLUE = '#007AFF';
const BG = '#FFFFFF';
const TEXT = '#1C1C1E';
const SUBTLE = '#8E8E93';
const DIVIDER = '#E5E5EA';

export default function App() {
  const [contacts, setContacts] = useState([]);
  const [query, setQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setContacts(JSON.parse(raw));
      } catch (e) {
        // ignore, start empty
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (loaded) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(contacts)).catch(() => {});
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

  function addContact() {
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
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

  function renderItem({ item }) {
    return (
      <TouchableOpacity
        style={styles.row}
        onLongPress={() => deleteContact(item.id)}
        activeOpacity={0.6}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.phone}>{item.phone}</Text>
        </View>
        <TouchableOpacity onPress={() => toggleFavorite(item.id)} hitSlop={10}>
          <Text style={[styles.star, item.favorite && styles.starActive]}>
            {item.favorite ? '★' : '☆'}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      <Text style={styles.title}>Phonebook</Text>

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
        renderItem={renderItem}
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
              <TouchableOpacity onPress={addContact} style={styles.saveBtn}>
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
