// Supabase 接続情報のテンプレート。
// このファイルを `config.js` にコピーして値を埋めてください。
//   cp config.example.js config.js
//
// ここに入れる publishable key（旧 anon key）はブラウザに公開される前提の
// 公開鍵で、Row Level Security によって保護されています。
// ※ service_role キーは絶対に置かないでください。
window.SUPABASE_CONFIG = {
  url: "YOUR_SUPABASE_URL",
  anonKey: "YOUR_SUPABASE_PUBLISHABLE_KEY",
};
