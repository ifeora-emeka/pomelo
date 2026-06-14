export const FRAMEWORK_NAME = "Kallo";
export const DEFAULT_PORT = 3000;

export const BLOCK_SERVER = "Server";
export const BLOCK_CLIENT = "Client";
export const BLOCK_VIEW = "View";
export const BLOCK_STYLE = "Style";

export const BLOCKS: readonly string[] = [
  BLOCK_SERVER,
  BLOCK_CLIENT,
  BLOCK_VIEW,
  BLOCK_STYLE,
  "Head",
];

export const TAG_EACH = "Each";
export const TAG_WHEN = "When";
export const TAG_SHOW = "Show";
export const TAG_ELSE = "Else";
export const TAG_SLOT = "Slot";
export const TAG_PORTAL = "Portal";
export const TAG_IMAGE = "Image";
export const TAG_SUSPENSE = "Suspense";
export const TAG_BOUNDARY = "Boundary";

export const VIEW_TAGS: readonly string[] = [
  TAG_EACH,
  TAG_WHEN,
  TAG_SHOW,
  TAG_ELSE,
  TAG_SLOT,
  TAG_PORTAL,
  TAG_IMAGE,
  TAG_SUSPENSE,
  TAG_BOUNDARY,
];

export const VOID_TAGS: readonly string[] = [
  "img",
  "input",
  "br",
  "hr",
  "meta",
  "link",
  "source",
  "col",
  "embed",
  "param",
  "track",
  "wbr",
];

export const NODE_TEXT = "Text";
export const NODE_ELEMENT = "Element";
export const NODE_ROOT = "Root";

export const SFC_EXTENSION = ".kal";

export const SCOPED_CSS_PREFIX = "data-kal-";

export const ATTR_EACH_OF = "of";
export const ATTR_EACH_AS = "as";

export const KW_SERVER_PAGE = "$page";
export const KW_SERVER_META = "$meta";
export const KW_SERVER_GUARD = "$guard";
export const KW_SERVER_LAYOUT = "$layout";
export const KW_SERVER_REDIRECT = "$redirect";
export const KW_SERVER_ABORT = "$abort";
export const KW_SERVER_CACHE = "$cache";
export const KW_SERVER_HEADERS = "$headers";
export const KW_SERVER_COOKIES = "$cookies";
export const KW_SERVER_SESSION = "$session";

export const KW_CLIENT_LOCAL = "$local";
export const KW_CLIENT_STORE = "$store";
export const KW_CLIENT_USE = "$use";
export const KW_CLIENT_WATCH = "$watch";
export const KW_CLIENT_ACTION = "$action";
export const KW_CLIENT_NEXT = "$next";
export const KW_CLIENT_MOUNT = "$mount";
export const KW_CLIENT_DESTROY = "$destroy";

export const COLOR_RESET = "\x1b[0m";
export const COLOR_MAGENTA = "\x1b[35m";
export const COLOR_GREEN = "\x1b[32m";
export const COLOR_YELLOW = "\x1b[33m";
export const COLOR_RED = "\x1b[31m";
