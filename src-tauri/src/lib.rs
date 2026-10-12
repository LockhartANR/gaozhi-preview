/// 桌面外壳：界面完全是前端的（dist/ 里的静态文件），
/// Rust 这一侧只负责开一个窗口，所以没有任何命令和插件。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
