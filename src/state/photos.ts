// A photo per casualty, so tired eyes can tell C2 from C3. Kept only on this
// phone, under Documents (the picker's own copy is in a cache iOS may clear).
// Casualties store the file name, never a full path: the app's container path
// can change between installs.

import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

const FOLDER = 'casualty-photos';
const OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5 };

function folder(): Directory {
  const dir = new Directory(Paths.document, FOLDER);
  dir.create({ idempotent: true });
  return dir;
}

export function photoUri(name: string): string {
  return new File(Paths.document, FOLDER, name).uri;
}

// The camera, or the photo library when the camera is refused or missing.
// Returns the saved file name, or null if nothing was taken.
export async function takePhoto(casualtyId: string): Promise<string | null> {
  let result: ImagePicker.ImagePickerResult | null = null;
  if ((await ImagePicker.requestCameraPermissionsAsync()).granted) {
    try {
      result = await ImagePicker.launchCameraAsync(OPTIONS);
    } catch {
      result = null; // no camera (e.g. a simulator)
    }
  }
  if (result === null) {
    if (!(await ImagePicker.requestMediaLibraryPermissionsAsync()).granted) {
      return null;
    }
    result = await ImagePicker.launchImageLibraryAsync(OPTIONS);
  }
  if (result.canceled) {
    return null;
  }
  const picked = new File(result.assets[0].uri);
  // a new name per photo, so a retake never shows the old image from cache
  const name = `${casualtyId}-${Date.now()}${picked.extension || '.jpg'}`;
  await picked.copy(new File(folder(), name));
  return name;
}

// Deletes photos no casualty uses any more (evacuated, reset, retaken)
export function prunePhotos(keep: Set<string>): void {
  try {
    for (const item of folder().list()) {
      if (item instanceof File && !keep.has(item.name)) {
        item.delete();
      }
    }
  } catch {
    // a photo left behind is harmless; never break the app over it
  }
}
