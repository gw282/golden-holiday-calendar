#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{thread, time::Duration};

#[cfg(not(debug_assertions))]
use std::{
    fs::{self, OpenOptions},
    net::TcpStream,
    process::{Command, Stdio},
};
#[cfg(all(windows, not(debug_assertions)))]
use std::os::windows::process::CommandExt;

use chrono::Local;
use serde::Deserialize;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};
use tauri_plugin_notification::NotificationExt;

/// `CREATE_NO_WINDOW` — 이게 없으면 node.exe가 콘솔 창을 따로 하나 더 띄운다.
/// 앱 자신은 위의 `windows_subsystem = "windows"`로 이미 숨겼지만, 그건 이 프로세스에만
/// 적용되고 **새로 spawn하는 자식 프로세스(node.exe)에는 안 걸린다** — 둘을 따로 꺼야 한다.
#[cfg(all(windows, not(debug_assertions)))]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// dev(`tauri:dev`)는 `npm run dev`(3000)를 그대로 보고, 배포본은 사이드카 서버(3210)를 본다.
const SERVER_PORT: &str = if cfg!(debug_assertions) { "3000" } else { "3210" };

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
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

            let window = tauri::WebviewWindowBuilder::new(app, "main", url)
                .title("황금연휴 캘린더")
                .inner_size(1440.0, 960.0)
                .min_inner_size(960.0, 700.0)
                .resizable(true)
                .build()?;

            // ── 시스템 트레이 ──────────────────────────────────────────
            // 닫기 버튼은 종료가 아니라 트레이로 숨긴다. 알림 폴링이 창 상태와
            // 무관하게 계속 돌아야 해서(숨겨져도 백그라운드 스레드는 그대로 산다),
            // 트레이 "종료"에서만 진짜로 끝낸다.
            let show_item = MenuItem::with_id(app, "show", "열기", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().unwrap())
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            let win = window.clone();
            window.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = win.hide();
                }
            });

            // ── 알림 ──────────────────────────────────────────────────
            // 창이 트레이에 숨어 있어도 이 스레드는 그대로 돈다 — 웹뷰 타이머와
            // 완전히 분리돼 있어 Electron에서 겪던 "숨긴 창의 타이머가 죽는다"는
            // 문제 자체가 없다.
            let handle = app.handle().clone();
            thread::spawn(move || run_notifier(&handle));

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

#[derive(Deserialize)]
struct EventItem {
    id: i64,
    title: String,
    #[serde(rename = "startTime")]
    start_time: Option<String>,
}

#[derive(Deserialize)]
struct EventsResponse {
    events: Vec<EventItem>,
}

const POLL_INTERVAL: Duration = Duration::from_secs(30);
const BREAK_INTERVAL: Duration = Duration::from_secs(50 * 60);
/// 시작 몇 분 전부터 알릴지
const REMIND_BEFORE_MIN: i64 = 10;

/// 일정 리마인더(시작 10분 전) + 50분 리프레시 알림.
///
/// Next 서버가 이미 알고 있는 오늘 일정을 30초마다 `/api/events?date=`로 직접
/// 찔러 본다 — 창(웹뷰)이 숨어 있어도 동작해야 하는 기능이라, 프런트에 기대지 않고
/// Rust가 사이드카 서버를 직접 보는 쪽이 더 견고하다.
fn run_notifier(app: &tauri::AppHandle) {
    use std::collections::HashSet;

    let mut notified: HashSet<i64> = HashSet::new();
    let mut notified_date = String::new();
    let mut last_break = std::time::Instant::now();

    loop {
        thread::sleep(POLL_INTERVAL);

        let today = Local::now().format("%Y-%m-%d").to_string();
        if today != notified_date {
            notified.clear();
            notified_date = today.clone();
        }

        if let Ok(events) = fetch_today_events(&today) {
            let now_min = hhmm_to_min(&Local::now().format("%H:%M").to_string());
            for e in events {
                let Some(start) = e.start_time.as_deref() else { continue };
                if notified.contains(&e.id) {
                    continue;
                }
                let diff = hhmm_to_min(start) - now_min;
                if (0..=REMIND_BEFORE_MIN).contains(&diff) {
                    let _ = app
                        .notification()
                        .builder()
                        .title("잠시 후 일정이 있습니다")
                        .body(format!("{start} — {}", e.title))
                        .show();
                    notified.insert(e.id);
                }
            }
        }

        if last_break.elapsed() >= BREAK_INTERVAL {
            let _ = app
                .notification()
                .builder()
                .title("50분간 열일하셨습니다")
                .body("잠시 일어나 스트레칭 해 보세요.")
                .show();
            last_break = std::time::Instant::now();
        }
    }
}

fn fetch_today_events(date: &str) -> Result<Vec<EventItem>, ureq::Error> {
    let url = format!("http://127.0.0.1:{SERVER_PORT}/api/events?date={date}");
    let body: EventsResponse = ureq::get(&url).call()?.into_json()?;
    Ok(body.events)
}

fn hhmm_to_min(s: &str) -> i64 {
    let mut parts = s.split(':');
    let h: i64 = parts.next().and_then(|v| v.parse().ok()).unwrap_or(0);
    let m: i64 = parts.next().and_then(|v| v.parse().ok()).unwrap_or(0);
    h * 60 + m
}
