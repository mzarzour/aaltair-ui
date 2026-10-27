declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    ALTAIR_OWNER_EMAIL?: string;
    BUCKET?: R2Bucket;
  }
}
