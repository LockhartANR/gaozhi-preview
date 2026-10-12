// Windows 发布版不要弹出控制台黑窗
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    gaozhi_preview_lib::run()
}
