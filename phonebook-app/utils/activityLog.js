import AsyncStorage from '@react-native-async-storage/async-storage';

const LOG_KEY = 'phonebook_activity_log_v1';
const MAX_ENTRIES = 500;

export async function loadActivityLog() {
  try {
    const raw = await AsyncStorage.getItem(LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export async function addActivityEntry(action, contact, extra) {
  try {
    const raw = await AsyncStorage.getItem(LOG_KEY);
    const log = raw ? JSON.parse(raw) : [];
    const entry = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      action, // 'add' | 'edit' | 'delete'
      name: contact?.name || '',
      phone: contact?.phone || '',
      extra: extra || null,
      timestamp: Date.now(),
    };
    const updated = [entry, ...log].slice(0, MAX_ENTRIES);
    await AsyncStorage.setItem(LOG_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    return null;
  }
}

export function formatLogTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
}
