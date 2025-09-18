// Global/browser shims used by pre-desktop web builds.

// 1) Some tags reference CommonJS-style `require` in UI code.
//    Declare it globally so TypeScript doesn't error in web builds.
declare var require: any;

// 2) Tags in Phase B added "favorites" features to the app state.
//    Older tags don't declare these on AppStateContext, so we augment
//    the type here to keep TS happy. Implementations can be no-ops
//    in the browser-only build until the real logic lands.
declare global {
  interface AppStateContext {
    favorites?: any[]; // list of favorites (shape not enforced here)
    addFavoriteFromPath?: (path: string) => void;
    addCustomUrl?: (url: string) => void;
    removeFavorite?: (idOrIndex: any) => void;
    renameFavorite?: (idOrIndex: any, name: string) => void;
  }
}

export {};
