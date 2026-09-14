#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs, thread, time::Duration};

#[cfg(not(debug_assertions))]
use std::{
    fs::OpenOptions,
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
    LogicalSize, Manager, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_notification::NotificationExt;

/// 기본 창 크기. 미니 모드에서 되돌아올 때도 이 값을 쓴다 — 사용자가 직접 늘려 놓은
/// 크기까지 기억하려면 상태를 따로 저장해야 하는데, 그 정도로 자주 쓰는 기능은 아니다.
const DEFAULT_SIZE: (f64, f64) = (1440.0, 960.0);
const MINI_SIZE: (f64, f64) = (360.0, 280.0);

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
        // `--hidden` 인자로 켜면(자동 실행 시) 트레이에만 조용히 자리잡는다.
        // 로그인 직후 창이 불쑥 뜨는 것보다 이쪽이 방해가 덜하다.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden".into()]),
        ))
        .invoke_handler(tauri::generate_handler![
            set_opacity,
            toggle_mini,
            set_autostart,
            get_autostart
        ])
        .setup(|app| {
            // 윈도우 토스트 알림에 "황금연휴 캘린더"라고 뜨게 하는 등록. 이게 없으면
            // 설치형(Win32, MSIX 아님) 앱은 AUMID 문자열(identifier)을 그대로 보여준다.
            register_toast_display_name(
                &app.config().identifier,
                app.config().product_name.as_deref().unwrap_or("황금연휴 캘린더"),
            );

            let hidden_start = std::env::args().any(|a| a == "--hidden");

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
                .inner_size(DEFAULT_SIZE.0, DEFAULT_SIZE.1)
                .min_inner_size(960.0, 700.0)
                .resizable(true)
                .visible(!hidden_start)
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

            // 출근 직후 오늘 일정 요약 — 서버가 막 뜬 직후일 수 있어 2초 정도
            // 기다렸다가 한 번만 찔러 본다. 자동 실행(로그인 시 시작)은 아직 없어서
            // 지금은 "하루 중 처음 켤 때" 뜬다. 필요하면 사용자가 시작프로그램
            // 폴더에 바로가기를 넣어 직접 자동 실행을 켤 수 있다.
            let handle2 = app.handle().clone();
            thread::spawn(move || {
                thread::sleep(Duration::from_secs(2));
                run_morning_summary(&handle2);
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Golden Holiday Calendar");
}

/// 토스트 알림에 뜨는 발신자 이름을 등록한다. 패키징 안 된(MSIX가 아닌) Win32 앱은
/// AUMID(`identifier`)와 표시 이름을 연결해 주는 등록이 따로 없으면, Windows가
/// 알림 발신자 자리에 `identifier` 문자열을 그대로 보여준다 — 매번 켤 때마다
/// 같은 값으로 덮어쓰므로(멱등) 실행 파일이 최신 이름과 다르게 등록될 일이 없다.
#[cfg(windows)]
fn register_toast_display_name(identifier: &str, display_name: &str) {
    use windows_registry::CURRENT_USER;

    let Ok(key) = CURRENT_USER.create(format!(r"SOFTWARE\Classes\AppUserModelId\{identifier}"))
    else {
        return;
    };
    let _ = key.set_string("DisplayName", display_name);
}

#[cfg(not(windows))]
fn register_toast_display_name(_identifier: &str, _display_name: &str) {}

/// 창 반투명. Tauri에 이걸 위한 크로스플랫폼 API가 없어(진짜 픽셀 단위 투명
/// `transparent: true`는 생성 시점에만 되고 실행 중엔 못 바꾼다) 레이어드 윈도우를
/// Win32 API로 직접 다룬다. 이 창 전체를 흐리게 하는 것뿐이라, 이 앱 범위에서는
/// 이 정도로 충분하다.
#[cfg(windows)]
#[tauri::command]
fn set_opacity(window: tauri::WebviewWindow, value: f64) -> Result<(), String> {
    use windows::Win32::Foundation::COLORREF;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetLayeredWindowAttributes, SetWindowLongPtrW, GWL_EXSTYLE,
        LWA_ALPHA, WS_EX_LAYERED,
    };

    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    let alpha = (value.clamp(0.3, 1.0) * 255.0).round() as u8;
    unsafe {
        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex_style | WS_EX_LAYERED.0 as isize);
        SetLayeredWindowAttributes(hwnd, COLORREF(0), alpha, LWA_ALPHA)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
fn set_opacity(_window: tauri::WebviewWindow, _value: f64) -> Result<(), String> {
    Err("이 플랫폼에서는 창 투명도를 지원하지 않습니다.".into())
}

/// 미니 모드 on/off. 최소 크기 제약도 같이 늦췄다 풀었다 해야 한다 — 안 그러면
/// `min_inner_size(960, 700)`에 걸려 작은 크기로 줄어들지 않는다.
#[tauri::command]
fn toggle_mini(window: tauri::WebviewWindow, mini: bool) -> Result<(), String> {
    let (min, target) = if mini {
        ((300.0, 220.0), MINI_SIZE)
    } else {
        ((960.0, 700.0), DEFAULT_SIZE)
    };
    window
        .set_min_size(Some(LogicalSize::new(min.0, min.1)))
        .map_err(|e| e.to_string())?;
    window
        .set_size(LogicalSize::new(target.0, target.1))
        .map_err(|e| e.to_string())?;
    window.set_always_on_top(mini).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let mgr = app.autolaunch();
    let result = if enabled { mgr.enable() } else { mgr.disable() };
    result.map_err(|e| e.to_string())
}

#[tauri::command]
fn get_autostart(app: tauri::AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

/// 배포본 사이드카 데이터 폴더이자, 아침 요약 발송 여부 같은 자잘한 상태 파일을
/// 두는 자리이기도 하다 — 그래서 개발 모드에서도 그대로 쓸 수 있게 cfg를 걷어냈다.
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
    /// 이 일정만 몇 분 전에 알릴지. `Some(0)`이면 이 일정은 알림을 아예 끈 것이고,
    /// `None`이면 전역 설정(`fetch_reminder_thresholds`)을 그대로 따른다.
    #[serde(rename = "reminderMinutes")]
    reminder_minutes: Option<i64>,
}

#[derive(Deserialize)]
struct EventsResponse {
    events: Vec<EventItem>,
}

const POLL_INTERVAL: Duration = Duration::from_secs(30);
const BREAK_INTERVAL: Duration = Duration::from_secs(50 * 60);
/// `/api/settings`가 비어 있거나 못 받아 왔을 때만 쓰는 값. 화면에서 고르면
/// DB에 저장돼 이 기본값 대신 그 값을 매 폴링마다 읽어 온다.
const DEFAULT_REMIND_THRESHOLDS_MIN: [i64; 2] = [60, 15];

#[derive(Deserialize)]
struct SettingsResponse {
    #[serde(rename = "reminderThresholds")]
    reminder_thresholds: Vec<i64>,
}

/// 화면의 '알림 시점' 체크박스가 저장한 값을 그대로 읽어 온다. 앱을 다시 켤 필요 없이
/// 다음 폴링(최대 30초 뒤)부터 반영되게 하려고 매번 새로 불러온다.
fn fetch_reminder_thresholds() -> Vec<i64> {
    let url = format!("http://127.0.0.1:{SERVER_PORT}/api/settings");
    ureq::get(&url)
        .call()
        .ok()
        .and_then(|r| r.into_json::<SettingsResponse>().ok())
        .filter(|s| !s.reminder_thresholds.is_empty())
        .map(|s| s.reminder_thresholds)
        .unwrap_or_else(|| DEFAULT_REMIND_THRESHOLDS_MIN.to_vec())
}

/// 일정 리마인더(화면에서 고른 시점마다 각각 한 번씩) + 50분 리프레시 알림.
///
/// Next 서버가 이미 알고 있는 오늘 일정을 30초마다 `/api/events?date=`로 직접
/// 찔러 본다 — 창(웹뷰)이 숨어 있어도 동작해야 하는 기능이라, 프런트에 기대지 않고
/// Rust가 사이드카 서버를 직접 보는 쪽이 더 견고하다.
///
/// 알림 이력은 `(일정 id, 문턱값)` 쌍으로 남긴다 — 같은 일정이라도 1시간 전 알림과
/// 15분 전 알림은 별개라 하나를 보냈다고 다른 하나를 건너뛰면 안 된다.
fn run_notifier(app: &tauri::AppHandle) {
    use std::collections::HashSet;

    let mut notified: HashSet<(i64, i64)> = HashSet::new();
    let mut notified_date = String::new();
    // 마우스·키보드 움직임까지 보려면 프런트에서 매번 활동 신호를 보내야 해서 복잡해진다.
    // 대신 "창이 보이는 동안만" 시간을 센다 — 트레이에 숨겨 자리를 비운 시간은
    // 50분에 포함되지 않는다. 창을 보이는 채로 다른 일을 해도 시간은 그대로 흐르지만,
    // 적어도 "컴퓨터를 아예 안 쓰고 있는데 알림이 울리는" 경우는 없앤다.
    let mut active_secs: u64 = 0;

    loop {
        thread::sleep(POLL_INTERVAL);

        let today = Local::now().format("%Y-%m-%d").to_string();
        if today != notified_date {
            notified.clear();
            notified_date = today.clone();
        }

        if let Ok(events) = fetch_today_events(&today) {
            let thresholds = fetch_reminder_thresholds();
            let now_min = hhmm_to_min(&Local::now().format("%H:%M").to_string());
            for e in events {
                let Some(start) = e.start_time.as_deref() else { continue };
                // 0이면 이 일정만 알림을 껐다는 뜻 — 전역 설정과 무관하게 건너뛴다.
                if e.reminder_minutes == Some(0) {
                    continue;
                }
                let diff = hhmm_to_min(start) - now_min;
                if diff < 0 {
                    continue;
                }
                // 이 일정에 따로 정한 시점이 있으면 그것만 쓰고, 없으면 전역 목록을 쓴다.
                let event_thresholds: Vec<i64> = match e.reminder_minutes {
                    Some(n) => vec![n],
                    None => thresholds.clone(),
                };
                for &threshold in &event_thresholds {
                    if diff > threshold || notified.contains(&(e.id, threshold)) {
                        continue;
                    }
                    let when = if diff >= 60 {
                        format!("{}시간 {}분", diff / 60, diff % 60)
                    } else {
                        format!("{diff}분")
                    };
                    let _ = app
                        .notification()
                        .builder()
                        .title(format!("{when} 후 일정이 있습니다"))
                        .body(format!("{start} — {}", e.title))
                        .show();
                    notified.insert((e.id, threshold));
                }
            }
        }

        let visible = app
            .get_webview_window("main")
            .and_then(|w| w.is_visible().ok())
            .unwrap_or(true);
        if visible {
            active_secs += POLL_INTERVAL.as_secs();
        }
        if active_secs >= BREAK_INTERVAL.as_secs() {
            let _ = app
                .notification()
                .builder()
                .title("50분간 열일하셨습니다")
                .body("잠시 일어나 스트레칭 해 보세요.")
                .show();
            active_secs = 0;
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

/// 앱을 켤 때 그날 처음이면 한 번, 오늘 일정 요약을 알린다.
///
/// 하루에 한 번만 보내려고 앱 데이터 폴더에 마지막으로 보낸 날짜만 적어 둔다 —
/// DB에 표를 새로 만들 만한 값어치가 없어 파일 하나로 충분하다.
fn run_morning_summary(app: &tauri::AppHandle) {
    let marker = app_data_dir().join("last-morning-summary.txt");
    let today = Local::now().format("%Y-%m-%d").to_string();

    if let Ok(last) = fs::read_to_string(&marker) {
        if last.trim() == today {
            return;
        }
    }

    let Ok(events) = fetch_today_events(&today) else { return };

    let body = if events.is_empty() {
        "오늘은 등록된 일정이 없습니다.".to_string()
    } else {
        let titles: Vec<&str> = events.iter().map(|e| e.title.as_str()).collect();
        format!("오늘 등록된 일정은 [{}] 총 {}건입니다.", titles.join("], ["), events.len())
    };

    let _ = app
        .notification()
        .builder()
        .title("좋은 아침입니다!")
        .body(body)
        .show();

    if let Some(dir) = marker.parent() {
        let _ = fs::create_dir_all(dir);
    }
    let _ = fs::write(&marker, &today);
}
