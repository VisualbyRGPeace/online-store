export type SavedPrompt = {
  id: string;
  name: string;
  body: string;
  values: Record<string, string>;
  imageData?: string;
  updatedAt: string;
};

const DATABASE = "online-store-utilities";
const STORE = "saved-prompts";
const VERSION = 1;

function openPromptDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Trình duyệt không hỗ trợ lưu prompt."));
      return;
    }
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Không mở được kho prompt."));
  });
}

export async function listSavedPrompts(): Promise<SavedPrompt[]> {
  const database = await openPromptDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, "readonly");
    const request = transaction.objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as SavedPrompt[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    request.onerror = () => reject(request.error ?? new Error("Không tải được prompt."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Không tải được prompt."));
    };
  });
}

export async function savePrompt(prompt: SavedPrompt): Promise<void> {
  const database = await openPromptDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(prompt);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Không lưu được prompt."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("Không lưu được prompt."));
    };
  });
}

export async function deletePrompt(id: string): Promise<void> {
  const database = await openPromptDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).delete(id);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Không xóa được prompt."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("Không xóa được prompt."));
    };
  });
}
