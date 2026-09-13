// Record storage remains on this device. Separate keys prevent one signed-in
// account from being shown another account's records through the app.
// localStorage is not encryption or protection against someone with device access.
(function (root) {
  const recordTypes = ['employees', 'attendance', 'leaves', 'payroll', 'performance'];

  function createAccountStore(storage, getAccount, legacyOwnerEmail = '') {
    function accountKey(type) {
      const account = getAccount();
      if (!account?.uid) throw new Error('Sign in before accessing records.');
      if (!recordTypes.includes(type)) throw new Error('Unknown record type.');
      return `staffhub_user_${encodeURIComponent(account.uid)}_${type}`;
    }

    function parseRecords(value) {
      const records = JSON.parse(value || '[]');
      if (!Array.isArray(records)) throw new Error('Saved records are not a list.');
      return records;
    }

    function canImportLegacy() {
      const account = getAccount();
      return Boolean(account?.emailVerified && legacyOwnerEmail &&
        account.email?.toLowerCase() === legacyOwnerEmail.toLowerCase());
    }

    return Object.freeze({
      get(type) {
        try { return parseRecords(storage.getItem(accountKey(type))); }
        catch { return []; }
      },
      set(type, records) {
        if (!Array.isArray(records)) throw new Error('Records must be a list.');
        storage.setItem(accountKey(type), JSON.stringify(records));
      },
      hasLegacyData() {
        if (!canImportLegacy()) return false;
        try {
          return recordTypes.some(type => parseRecords(storage.getItem(`staffhub_${type}`)).length);
        } catch {
          return false;
        }
      },
      importLegacy() {
        if (!canImportLegacy()) throw new Error('Only the configured owner can import old records.');
        const copies = recordTypes.map(type => ({
          target: accountKey(type),
          records: parseRecords(storage.getItem(`staffhub_${type}`))
        }));
        // Check all destinations before writing anything. Do not overwrite data.
        if (copies.some(copy => parseRecords(storage.getItem(copy.target)).length)) {
          throw new Error('This account already has records. Import would overwrite them.');
        }
        const originals = copies.map(copy => storage.getItem(copy.target));
        try {
          copies.forEach(copy => storage.setItem(copy.target, JSON.stringify(copy.records)));
        } catch (error) {
          copies.forEach((copy, index) => {
            if (originals[index] === null) storage.removeItem(copy.target);
            else storage.setItem(copy.target, originals[index]);
          });
          throw error;
        }
        // Legacy keys are intentionally preserved as a backup.
      }
    });
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { createAccountStore };
  else root.createAccountStore = createAccountStore;
})(typeof window !== 'undefined' ? window : globalThis);
