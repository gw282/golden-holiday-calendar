#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(not(debug_assertions))]
use std::{
    fs::{self, OpenOptions},
    net::TcpStream,
    process::{Command, Stdio},
    thread,
    time::Duration,
};
#[cfg(all(windows, not(debug_assertions)))]
use std::os::windows::process::CommandExt;
use tauri::Manager;

/// `CREATE_NO_WINDOW` — 이게 없으면 node.exe가 콘솔 창을 따로 하나 더 띄운다.
/// 앱 자신은 위의 `windows_subsystem = "windows"`로 이미 숨겼지만, 그건 이 프로세스에만
/// 적용되고 **새로 spawn하는 자식 프로세스(node.exe)에는 안 걸린다** — 둘을 따로 꺼야 한다.
#[cfg(all(windows, not(debug_assertions)))]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(debug_assertions)]
            let url = tauri::WebviewUrl::External("http://localhost:3000".parse().unwrap());

            #[cfg(not(debug_assertions))]
            let url = {
                let resource_dir = app.path().resource_dir()?;
                let server_root = resource_dir.join("app");
                let data_dir = app_data_dir();
                fs::create_dir_all(&data_dir)?;
                let node = resource_dir.join("node.exe");
                let stdout = OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(data_dir.join("server.log"))?;
                let stderr = stdout.try_clone()?;

                let mut cmd = Command::new(node);
                cmd.current_dir(&server_root)
                    .arg("server.js")
                    .env("HOSTNAME", "127.0.0.1")
                    .env("PORT", "3210")
                    .env("NODE_ENV", "production")
                    .env("OFFLINE_DEFAULT", "1")
                    .env("CHAT_DISABLED", "1")
                    .env("DESKTOP_APP", "1")
                    .env("APP_DATA_DIR", &data_dir)
                    .env("NODE_PATH", server_root.join("runtime"))
                    .stdout(Stdio::from(stdout))
                    .stderr(Stdio::from(stderr));
                #[cfg(windows)]
                cmd.creation_flags(CREATE_NO_WINDOW);
                cmd.spawn()?;

                for _ in 0..80 {
                    if TcpStream::connect("127.0.0.1:3210").is_ok() {
                        break;
                    }
                    thread::sleep(Duration::from_millis(100));
                }

                tauri::WebviewUrl::External("http://127.0.0.1:3210".parse().unwrap())
            };

            tauri::WebviewWindowBuilder::new(app, "main", url)
                .title("황금연휴 캘린더")
                .inner_size(1440.0, 960.0)
                .min_inner_size(960.0, 700.0)
                .resizable(true)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Golden Holiday Calendar");
}

#[cfg(not(debug_assertions))]
fn app_data_dir() -> std::path::PathBuf {
    std::env::var_os("APPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("황금연휴 캘린더")
        .join("data")
}
