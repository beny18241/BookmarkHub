import BookmarkService from '../utils/services'
import { Setting } from '../utils/setting'
import iconLogo from '../assets/icon.png'
import { OperType, BookmarkInfo, SyncDataInfo, RootBookmarksType, BrowserType } from '../utils/models'
import { Bookmarks } from 'wxt/browser'
export default defineBackground(() => {

  browser.runtime.onInstalled.addListener(c => {
    // Initialize auto-sync on installation
    initializeAutoSync();
  });

  let curOperType = OperType.NONE;
  let curBrowserType = BrowserType.CHROME;
  let autoSyncDebounceTimer: NodeJS.Timeout | null = null;
  let lastRemoteUpdateTime: number = 0;
  let isSyncing: boolean = false;
  const DEBOUNCE_DELAY = 3000; // 3 seconds debounce delay

  // Icon states
  const ICON_SYNCED = "✓";
  const ICON_NOT_SYNCED = "!";
  const ICON_SYNCING = "↻";
  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.name === 'upload') {
      curOperType = OperType.SYNC
      uploadBookmarks().then(() => {
        curOperType = OperType.NONE
        // After manual upload, show synced state
        browser.action.setBadgeText({ text: ICON_SYNCED });
        browser.action.setBadgeBackgroundColor({ color: "#00AA00" });
        refreshLocalCount();
        sendResponse(true);
      });
    }
    if (msg.name === 'download') {
      curOperType = OperType.SYNC
      downloadBookmarks().then(() => {
        curOperType = OperType.NONE
        // After manual download, show synced state
        browser.action.setBadgeText({ text: ICON_SYNCED });
        browser.action.setBadgeBackgroundColor({ color: "#00AA00" });
        refreshLocalCount();
        sendResponse(true);
      });

    }
    if (msg.name === 'removeAll') {
      curOperType = OperType.REMOVE
      clearBookmarkTree().then(() => {
        curOperType = OperType.NONE
        // After removing all, bookmarks are "synced" (empty state)
        browser.action.setBadgeText({ text: ICON_SYNCED });
        browser.action.setBadgeBackgroundColor({ color: "#00AA00" });
        refreshLocalCount();
        sendResponse(true);
      });

    }
    if (msg.name === 'setting') {
      browser.runtime.openOptionsPage().then(() => {
        sendResponse(true);
      });
    }
    if (msg.name === 'updateAutoSync') {
      initializeAutoSync().then(() => {
        sendResponse(true);
      });
    }
    return true;
  });
  browser.bookmarks.onCreated.addListener(async (id, info) => {
    if (curOperType === OperType.NONE) {
      // Show not synced icon
      browser.action.setBadgeText({ text: ICON_NOT_SYNCED });
      browser.action.setBadgeBackgroundColor({ color: "#FFA500" }); // Orange
      refreshLocalCount();
      // Trigger auto-sync if enabled
      await triggerAutoSync();
    }
  });
  browser.bookmarks.onChanged.addListener(async (id, info) => {
    if (curOperType === OperType.NONE) {
      // Show not synced icon
      browser.action.setBadgeText({ text: ICON_NOT_SYNCED });
      browser.action.setBadgeBackgroundColor({ color: "#FFA500" }); // Orange
      // Trigger auto-sync if enabled
      await triggerAutoSync();
    }
  })
  browser.bookmarks.onMoved.addListener(async (id, info) => {
    if (curOperType === OperType.NONE) {
      // Show not synced icon
      browser.action.setBadgeText({ text: ICON_NOT_SYNCED });
      browser.action.setBadgeBackgroundColor({ color: "#FFA500" }); // Orange
      // Trigger auto-sync if enabled
      await triggerAutoSync();
    }
  })
  browser.bookmarks.onRemoved.addListener(async (id, info) => {
    if (curOperType === OperType.NONE) {
      // Show not synced icon
      browser.action.setBadgeText({ text: ICON_NOT_SYNCED });
      browser.action.setBadgeBackgroundColor({ color: "#FFA500" }); // Orange
      refreshLocalCount();
      // Trigger auto-sync if enabled
      await triggerAutoSync();
    }
  })

  async function uploadBookmarks() {
    try {
      let setting = await Setting.build()
      if (setting.githubToken == '') {
        throw new Error("Gist Token Not Found");
      }
      if (setting.gistID == '') {
        throw new Error("Gist ID Not Found");
      }
      if (setting.gistFileName == '') {
        throw new Error("Gist File Not Found");
      }
      let bookmarks = await getBookmarks();
      let syncdata = new SyncDataInfo();
      syncdata.version = browser.runtime.getManifest().version;
      syncdata.createDate = Date.now();
      syncdata.bookmarks = formatBookmarks(bookmarks);
      syncdata.browser = navigator.userAgent;
      await BookmarkService.update({
        files: {
          [setting.gistFileName]: {
            content: JSON.stringify(syncdata)
          }
        },
        description: setting.gistFileName
      });
      const count = getBookmarkCount(syncdata.bookmarks);
      await browser.storage.local.set({ remoteCount: count });

      // Show success with icon (keep it persistent)
      browser.action.setBadgeText({ text: ICON_SYNCED });
      browser.action.setBadgeBackgroundColor({ color: "#00AA00" });

    }
    catch (error: any) {
      console.error(error);
      await browser.notifications.create({
        type: "basic",
        iconUrl: iconLogo,
        title: browser.i18n.getMessage('uploadBookmarks'),
        message: `${browser.i18n.getMessage('error')}：${error.message}`
      });
    }
  }
  async function downloadBookmarks() {
    try {
      let gist = await BookmarkService.get();
      let setting = await Setting.build()
      if (gist) {
        let syncdata: SyncDataInfo = JSON.parse(gist);
        if (syncdata.bookmarks == undefined || syncdata.bookmarks.length == 0) {
          if (setting.enableNotify) {
            await browser.notifications.create({
              type: "basic",
              iconUrl: iconLogo,
              title: browser.i18n.getMessage('downloadBookmarks'),
              message: `${browser.i18n.getMessage('error')}：Gist File ${setting.gistFileName} is NULL`
            });
          }
          return;
        }
        await clearBookmarkTree();
        await createBookmarkTree(syncdata.bookmarks);
        const count = getBookmarkCount(syncdata.bookmarks);
        await browser.storage.local.set({ remoteCount: count });

        // Show success with icon
        browser.action.setBadgeText({ text: ICON_SYNCED });
        browser.action.setBadgeBackgroundColor({ color: "#00AA00" });
        setTimeout(() => {
          browser.action.setBadgeText({ text: "" });
        }, 2000);
      }
      else {
        await browser.notifications.create({
          type: "basic",
          iconUrl: iconLogo,
          title: browser.i18n.getMessage('downloadBookmarks'),
          message: `${browser.i18n.getMessage('error')}：Gist File ${setting.gistFileName} Not Found`
        });
      }
    }
    catch (error: any) {
      console.error(error);
      await browser.notifications.create({
        type: "basic",
        iconUrl: iconLogo,
        title: browser.i18n.getMessage('downloadBookmarks'),
        message: `${browser.i18n.getMessage('error')}：${error.message}`
      });
    }
  }

  async function getBookmarks() {
    let bookmarkTree: BookmarkInfo[] = await browser.bookmarks.getTree();
    if (bookmarkTree && bookmarkTree[0].id === "root________") {
      curBrowserType = BrowserType.FIREFOX;
    }
    else {
      curBrowserType = BrowserType.CHROME;
    }
    return bookmarkTree;
  }

  async function clearBookmarkTree() {
    try {
      let setting = await Setting.build()
      if (setting.githubToken == '') {
        throw new Error("Gist Token Not Found");
      }
      if (setting.gistID == '') {
        throw new Error("Gist ID Not Found");
      }
      if (setting.gistFileName == '') {
        throw new Error("Gist File Not Found");
      }
      let bookmarks = await getBookmarks();
      let tempNodes: BookmarkInfo[] = [];
      bookmarks[0].children?.forEach(c => {
        c.children?.forEach(d => {
          tempNodes.push(d)
        })
      });
      if (tempNodes.length > 0) {
        for (let node of tempNodes) {
          if (node.id) {
            await browser.bookmarks.removeTree(node.id)
          }
        }
      }
      if (curOperType === OperType.REMOVE) {
        // Show success with icon
        browser.action.setBadgeText({ text: ICON_SYNCED });
        browser.action.setBadgeBackgroundColor({ color: "#00AA00" });
        setTimeout(() => {
          browser.action.setBadgeText({ text: "" });
        }, 2000);
      }
    }
    catch (error: any) {
      console.error(error);
      await browser.notifications.create({
        type: "basic",
        iconUrl: iconLogo,
        title: browser.i18n.getMessage('removeAllBookmarks'),
        message: `${browser.i18n.getMessage('error')}：${error.message}`
      });
    }
  }

  async function createBookmarkTree(bookmarkList: BookmarkInfo[] | undefined) {
    if (bookmarkList == null) {
      return;
    }
    for (let i = 0; i < bookmarkList.length; i++) {
      let node = bookmarkList[i];
      if (node.title == RootBookmarksType.MenuFolder
        || node.title == RootBookmarksType.MobileFolder
        || node.title == RootBookmarksType.ToolbarFolder
        || node.title == RootBookmarksType.UnfiledFolder) {
        if (curBrowserType == BrowserType.FIREFOX) {
          switch (node.title) {
            case RootBookmarksType.MenuFolder:
              node.children?.forEach(c => c.parentId = "menu________");
              break;
            case RootBookmarksType.MobileFolder:
              node.children?.forEach(c => c.parentId = "mobile______");
              break;
            case RootBookmarksType.ToolbarFolder:
              node.children?.forEach(c => c.parentId = "toolbar_____");
              break;
            case RootBookmarksType.UnfiledFolder:
              node.children?.forEach(c => c.parentId = "unfiled_____");
              break;
            default:
              node.children?.forEach(c => c.parentId = "unfiled_____");
              break;
          }
        } else {
          switch (node.title) {
            case RootBookmarksType.MobileFolder:
              node.children?.forEach(c => c.parentId = "3");
              break;
            case RootBookmarksType.ToolbarFolder:
              node.children?.forEach(c => c.parentId = "1");
              break;
            case RootBookmarksType.UnfiledFolder:
            case RootBookmarksType.MenuFolder:
              node.children?.forEach(c => c.parentId = "2");
              break;
            default:
              node.children?.forEach(c => c.parentId = "2");
              break;
          }
        }
        await createBookmarkTree(node.children);
        continue;
      }

      let res: Bookmarks.BookmarkTreeNode = { id: '', title: '' };
      try {
        /* 处理firefox中创建 chrome://chrome-urls/ 格式的书签会报错的问题 */
        res = await browser.bookmarks.create({
          parentId: node.parentId,
          title: node.title,
          url: node.url
        });
      } catch (err) {
        console.error(res, err);
      }
      if (res.id && node.children && node.children.length > 0) {
        node.children.forEach(c => c.parentId = res.id);
        await createBookmarkTree(node.children);
      }
    }
  }

  function getBookmarkCount(bookmarkList: BookmarkInfo[] | undefined) {
    let count = 0;
    if (bookmarkList) {
      bookmarkList.forEach(c => {
        if (c.url) {
          count = count + 1;
        }
        else {
          count = count + getBookmarkCount(c.children);
        }
      });
    }
    return count;
  }

  async function refreshLocalCount() {
    let bookmarkList = await getBookmarks();
    const count = getBookmarkCount(bookmarkList);
    await browser.storage.local.set({ localCount: count });
  }


  function formatBookmarks(bookmarks: BookmarkInfo[]): BookmarkInfo[] | undefined {
    if (bookmarks[0].children) {
      for (let a of bookmarks[0].children) {
        switch (a.id) {
          case "1":
          case "toolbar_____":
            a.title = RootBookmarksType.ToolbarFolder;
            break;
          case "menu________":
            a.title = RootBookmarksType.MenuFolder;
            break;
          case "2":
          case "unfiled_____":
            a.title = RootBookmarksType.UnfiledFolder;
            break;
          case "3":
          case "mobile______":
            a.title = RootBookmarksType.MobileFolder;
            break;
        }
      }
    }

    let a = format(bookmarks[0]);
    return a.children;
  }

  function format(b: BookmarkInfo): BookmarkInfo {
    b.dateAdded = undefined;
    b.dateGroupModified = undefined;
    b.id = undefined;
    b.index = undefined;
    b.parentId = undefined;
    b.type = undefined;
    b.unmodifiable = undefined;
    if (b.children && b.children.length > 0) {
      b.children?.map(c => format(c))
    }
    return b;
  }
  ///暂时不启用自动备份
  /*
  async function backupToLocalStorage(bookmarks: BookmarkInfo[]) {
      try {
          let syncdata = new SyncDataInfo();
          syncdata.version = browser.runtime.getManifest().version;
          syncdata.createDate = Date.now();
          syncdata.bookmarks = formatBookmarks(bookmarks);
          syncdata.browser = navigator.userAgent;
          const keyname = 'BookmarkHub_backup_' + Date.now().toString();
          await browser.storage.local.set({ [keyname]: JSON.stringify(syncdata) });
      }
      catch (error:any) {
          console.error(error)
      }
  }
  */

  // Auto-sync functions
  async function initializeAutoSync() {
    // Clear any existing debounce timer
    if (autoSyncDebounceTimer) {
      clearTimeout(autoSyncDebounceTimer);
      autoSyncDebounceTimer = null;
    }

    const setting = await Setting.build();

    // If auto-sync is enabled, perform an initial sync to get the latest state
    if (setting.enableAutoSync && setting.githubToken && setting.gistID) {
      // Show synced state on startup (optimistic)
      browser.action.setBadgeText({ text: ICON_SYNCED });
      browser.action.setBadgeBackgroundColor({ color: "#00AA00" });

      await performAutoSync();
    }
  }

  async function triggerAutoSync() {
    const setting = await Setting.build();

    // Only trigger if auto-sync is enabled
    if (!setting.enableAutoSync || !setting.githubToken || !setting.gistID) {
      return;
    }

    // Clear existing timer if any
    if (autoSyncDebounceTimer) {
      clearTimeout(autoSyncDebounceTimer);
    }

    // Set a new debounce timer
    autoSyncDebounceTimer = setTimeout(async () => {
      await performAutoSync();
      autoSyncDebounceTimer = null;
    }, DEBOUNCE_DELAY);
  }

  async function performAutoSync() {
    try {
      const setting = await Setting.build();

      // Check if auto-sync is still enabled and configured
      if (!setting.enableAutoSync || !setting.githubToken || !setting.gistID) {
        return;
      }

      // Show syncing icon
      isSyncing = true;
      browser.action.setBadgeText({ text: ICON_SYNCING });
      browser.action.setBadgeBackgroundColor({ color: "#0000FF" }); // Blue for syncing

      // Set operation type to prevent badge updates
      curOperType = OperType.SYNC;

      // Get local bookmarks
      const localBookmarks = await getBookmarks();
      const localCount = getBookmarkCount(localBookmarks);
      const localData = formatBookmarks(localBookmarks);

      // Get remote bookmarks
      const remoteGist = await BookmarkService.get();

      if (remoteGist) {
        const remoteData: SyncDataInfo = JSON.parse(remoteGist);
        const remoteCount = getBookmarkCount(remoteData.bookmarks);

        // Smart sync decision:
        // 1. If we haven't tracked remote time yet, compare content
        // 2. If remote was updated after our last known update AND content differs, download
        // 3. Otherwise upload our changes

        const localContentHash = JSON.stringify(localData);
        const remoteContentHash = JSON.stringify(remoteData.bookmarks);

        if (localContentHash === remoteContentHash) {
          // Already in sync, nothing to do
          console.log('Auto-sync: Already in sync');
          lastRemoteUpdateTime = remoteData.createDate;
        } else if (lastRemoteUpdateTime > 0 && remoteData.createDate > lastRemoteUpdateTime) {
          // Remote has newer changes, download them
          console.log('Auto-sync: Downloading newer remote changes');
          await clearBookmarkTree();
          await createBookmarkTree(remoteData.bookmarks);
          await browser.storage.local.set({ remoteCount: remoteCount });
          lastRemoteUpdateTime = remoteData.createDate;
        } else {
          // Upload local changes
          console.log('Auto-sync: Uploading local changes');
          const syncdata = new SyncDataInfo();
          syncdata.version = browser.runtime.getManifest().version;
          syncdata.createDate = Date.now();
          syncdata.bookmarks = localData;
          syncdata.browser = navigator.userAgent;

          await BookmarkService.update({
            files: {
              [setting.gistFileName]: {
                content: JSON.stringify(syncdata)
              }
            },
            description: setting.gistFileName
          });

          await browser.storage.local.set({ remoteCount: localCount });
          lastRemoteUpdateTime = syncdata.createDate;
        }
      } else {
        // No remote data, upload initial
        console.log('Auto-sync: Initial upload');
        const syncdata = new SyncDataInfo();
        syncdata.version = browser.runtime.getManifest().version;
        syncdata.createDate = Date.now();
        syncdata.bookmarks = localData;
        syncdata.browser = navigator.userAgent;

        await BookmarkService.update({
          files: {
            [setting.gistFileName]: {
              content: JSON.stringify(syncdata)
            }
          },
          description: setting.gistFileName
        });

        await browser.storage.local.set({ remoteCount: localCount });
        lastRemoteUpdateTime = syncdata.createDate;
      }

      // Show synced icon (keep it persistent)
      browser.action.setBadgeText({ text: ICON_SYNCED });
      browser.action.setBadgeBackgroundColor({ color: "#00AA00" }); // Green for synced

    } catch (error) {
      console.error('Auto-sync error:', error);
      // Show error state
      browser.action.setBadgeText({ text: "✗" });
      browser.action.setBadgeBackgroundColor({ color: "#FF0000" }); // Red for error
    } finally {
      isSyncing = false;
      curOperType = OperType.NONE;
      await refreshLocalCount();
    }
  }

  // Initialize auto-sync on startup
  initializeAutoSync();

});