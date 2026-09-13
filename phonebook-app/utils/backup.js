import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { toCSV } from './csv';

const BACKUP_FILE_NAME = 'phonebook_backup.csv';
const DELETED_FILE_NAME = 'deleted_contacts.csv';
const DELETED_DIR_KEY = 'phonebook_deleted_dir_v1';

export async function writeMainBackup(dirUri, contacts) {
  const csv = toCSV(contacts);
  const existing = await FileSystem.StorageAccessFramework.readDirectoryAsync(dirUri);
  let fileUri = existing.find((uri) => uri.includes(BACKUP_FILE_NAME));
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
}

async function getOrCreateDeletedDir(parentDirUri) {
  const cached = await AsyncStorage.getItem(DELETED_DIR_KEY);
  if (cached) return cached;

  // try to find an existing "deleted" dir by re-reading parent (SAF list gives files, not subfolders reliably,
  // so we just create once and cache the uri going forward)
  const dirUri = await FileSystem.StorageAccessFramework.makeDirectoryAsync(
    parentDirUri,
    'deleted'
  );
  await AsyncStorage.setItem(DELETED_DIR_KEY, dirUri);
  return dirUri;
}

export async function appendDeletedContact(parentDirUri, contact) {
  const dirUri = await getOrCreateDeletedDir(parentDirUri);
  const existingFiles = await FileSystem.StorageAccessFramework.readDirectoryAsync(dirUri);
  let fileUri = existingFiles.find((uri) => uri.includes(DELETED_FILE_NAME));

  const row = `${contact.name},${contact.phone},${new Date().toISOString()}`;

  if (!fileUri) {
    fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
      dirUri,
      DELETED_FILE_NAME,
      'text/csv'
    );
    await FileSystem.writeAsStringAsync(fileUri, `name,phone,deleted_at\n${row}`, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } else {
    const existingText = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    await FileSystem.writeAsStringAsync(fileUri, `${existingText}\n${row}`, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }
}
