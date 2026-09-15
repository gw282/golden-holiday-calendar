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
const SERVER_HOST: &str = if cfg!(debug_assertions) { "localhost" } else { "127.0.0.1" };

/// 트레이 미니 팝업 창 크기.
const TRAY_POPUP_SIZE: (f64, f64) = (300.0, 380.0);

/// 전역 퀵 입력창 크기와 단축키. 알프레드/스포트라이트처럼 화면 가운데 뜨는 한 줄짜리 입력창.
const QUICK_ADD_SIZE: (f64, f64) = (600.0, 76.0);
const QUICK_ADD_SHORTCUT: &str = "Ctrl+Shift+Space";

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
        // 앱이 트레이에 숨어 있어도(포커스가 없어도) 단축키를 받으려면 OS에 등록해야
        // 한다 — 일반 keydown 리스너는 우리 창이 포커스를 가졌을 때만 동작한다.
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        toggle_quick_add(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            set_opacity,
            toggle_mini,
            set_autostart,
            get_autostart,
            show_main,
            hide_quick_add,
            refresh_main_and_hide_quick_add
        ])
        .setup(|app| {
            // 윈도우 토스트 알림에 "황금연휴 캘린더"라고 뜨게 하는 등록. 이게 없으면
            // 설치형(Win32, MSIX 아님) 앱은 AUMID 문자열(identifier)을 그대로 보여준다.
            register_toast_display_name(
                &app.config().identifier,
                app.config().product_name.as_deref().unwrap_or("황금연휴 캘린더"),
            );

            let hidden_start = std::env::args().any(|a| a == "--hidden");

            #[cfg(not(debug_assertions))]
            {
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
                let child = cmd.spawn()?;
                // 이 프로세스가 어떻게 끝나든(정상 종료·트레이 종료·강제 종료) node.exe
                // 사이드카가 같이 죽도록 Job Object에 묶는다. 이게 없으면 트레이 "종료"로
                // 앱을 꺼도 사이드카는 살아남아 3210 포트를 붙든 채 백그라운드에 남고,
                // 다음에 앱을 새로 켜도(재설치해도!) 이미 그 포트가 응답하고 있으니
                // 새 사이드카를 띄운 줄 알고 사실은 계속 그 옛날 프로세스에 붙는다 —
                // 아무리 다시 빌드해도 화면이 바뀐 게 하나도 안 보이는 것처럼 보인다.
                #[cfg(windows)]
                if let Err(e) = kill_on_close(&child) {
                    eprintln!("사이드카 Job Object 설정 실패: {e}");
                }

                for _ in 0..80 {
                    if TcpStream::connect(format!("{SERVER_HOST}:{SERVER_PORT}")).is_ok() {
                        break;
                    }
                    thread::sleep(Duration::from_millis(100));
                }
            }

            let base_url = format!("http://{SERVER_HOST}:{SERVER_PORT}");
            let url = tauri::WebviewUrl::External(base_url.parse().unwrap());
            let tray_url = tauri::WebviewUrl::External(format!("{base_url}/tray").parse().unwrap());

            let window = tauri::WebviewWindowBuilder::new(app, "main", url)
                .title("황금연휴 캘린더")
                .inner_size(DEFAULT_SIZE.0, DEFAULT_SIZE.1)
                .min_inner_size(960.0, 700.0)
                .resizable(true)
                .visible(!hidden_start)
                // WebView2의 OS 파일-드롭 핸들러가 켜져 있으면(기본값) 화면 안에서
                // 쓰는 HTML5 드래그 앤 드롭(달력 일정 이동/복사)이 윈도우에서는 아예
                // 안 먹는다 — 같은 마우스 이벤트를 그쪽이 먼저 가로챈다. 이 창은
                // 밖에서 파일을 끌어다 놓는 기능이 없으니 꺼도 잃는 게 없다.
                .disable_drag_drop_handler()
                .build()?;

            // 트레이 미니 팝업 — 매번 새 창을 만들지 않고 하나를 숨겼다 보여줬다 한다.
            // "오늘 남은 일정"만 훑어보는 가벼운 용도라 장식(제목표시줄)도, 작업표시줄
            // 항목도 없앤다. `/tray` 페이지가 무엇을 보여줄지는 서버(Next) 쪽에서 정한다 —
            // Rust는 창을 띄우고 위치만 잡을 뿐, "오늘 남았나/내일 첫 일정인가" 분기는
            // 모르는 편이 낫다(그 로직은 DB를 직접 보는 서버 컴포넌트가 훨씬 간단하다).
            let tray_popup = tauri::WebviewWindowBuilder::new(app, "tray", tray_url)
                .title("오늘 일정")
                .inner_size(TRAY_POPUP_SIZE.0, TRAY_POPUP_SIZE.1)
                .resizable(false)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .shadow(true)
                .visible(false)
                .build()?;

            // 팝업 밖을 클릭해 포커스를 잃으면 닫는다 — 흔한 플라이아웃 동작.
            // (트레이 아이콘 hover로 여는 방식은 일부러 안 했다 — 마우스가 트레이에서
            // 팝업 쪽으로 넘어가는 순간 Leave 이벤트가 먼저 떠서 안의 버튼을 누르기도
            // 전에 닫혀 버린다. 클릭으로 열고 클릭/포커스아웃으로 닫는 쪽이 더 믿을 만하다.)
            let tp = tray_popup.clone();
            tray_popup.on_window_event(move |event| {
                if let WindowEvent::Focused(false) = event {
                    let _ = tp.hide();
                }
            });

            // 전역 퀵 입력창(알프레드/스포트라이트 스타일) — 장식도 작업표시줄 항목도
            // 없이 화면 가운데 떠서, 입력한 문장을 곧장 lib/quickParse.ts로 넘겨
            // 일정을 만든다. transparent(true)라 창 배경이 페이지가 실제로 그린
            // 만큼만 보인다 — 둥근 카드 하나만 데스크톱 위에 떠 있는 것처럼 보이는
            // 이유가 이것이다.
            let quick_add_url =
                tauri::WebviewUrl::External(format!("{base_url}/quick-add").parse().unwrap());
            let quick_add = tauri::WebviewWindowBuilder::new(app, "quickadd", quick_add_url)
                .title("빠른 일정 추가")
                .inner_size(QUICK_ADD_SIZE.0, QUICK_ADD_SIZE.1)
                .resizable(false)
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .skip_taskbar(true)
                .shadow(false)
                .center()
                .visible(false)
                .build()?;

            let qa = quick_add.clone();
            quick_add.on_window_event(move |event| {
                if let WindowEvent::Focused(false) = event {
                    let _ = qa.hide();
                }
            });

            // Ctrl+Shift+Space는 앱이 트레이에 숨어 있어도 OS가 직접 받아 우리에게
            // 알려준다. 등록이 실패해도(다른 앱이 이미 쓰는 중일 수 있다) 앱 자체는
            // 그대로 켜져야 하므로 ?로 전체를 실패시키지 않는다.
            use tauri_plugin_global_shortcut::GlobalShortcutExt;
            if let Err(e) = app.global_shortcut().register(QUICK_ADD_SHORTCUT) {
                eprintln!("전역 단축키 등록 실패: {e}");
            }

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
                        position,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        let Some(popup) = app.get_webview_window("tray") else { return };
                        if popup.is_visible().unwrap_or(false) {
                            let _ = popup.hide();
                            return;
                        }
                        // 트레이는 보통 화면 오른쪽 아래에 있다. 클릭 지점을 팝업의
                        // 오른쪽 아래 모서리로 보고 왼쪽 위로 띄우면 화면 밖으로 안 나간다.
                        let x = (position.x - TRAY_POPUP_SIZE.0).max(0.0);
                        let y = (position.y - TRAY_POPUP_SIZE.1).max(0.0);
                        let _ = popup.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
                        let _ = popup.show();
                        let _ = popup.set_focus();
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

/// node.exe 사이드카를 Windows Job Object에 묶어, 이 프로세스가 죽는 순간(정상
/// 종료든 크래시든 작업 관리자로 강제 종료든) OS가 사이드카도 같이 끝내게 만든다.
/// `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`가 핵심 — job에 묶인 프로세스가 하나라도
/// 살아 있는 동안 이 프로세스의 핸들 테이블이 정리되면(=프로세스 종료) job의
/// 마지막 핸들도 같이 닫히면서 묶인 프로세스를 전부 죽인다. `HANDLE`은 그냥 숫자
/// 하나를 감싼 타입이라(Drop이 없다) 따로 닫을 것도, 살려 둘 것도 없다.
#[cfg(windows)]
fn kill_on_close(child: &std::process::Child) -> windows::core::Result<()> {
    use std::os::windows::io::AsRawHandle;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    unsafe {
        let job = CreateJobObjectW(None, windows::core::PCWSTR::null())?;
        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const std::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )?;
        let process = HANDLE(child.as_raw_handle());
        AssignProcessToJobObject(job, process)?;
    }
    Ok(())
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

/// 트레이 미니 팝업의 "전체 달력 열기" 버튼이 부른다. 팝업 자체는 자기가 포커스를
/// 잃으면(메인 창에 포커스가 넘어가는 순간 포함) 알아서 숨으므로 여기서 따로 안 닫아도 된다.
#[tauri::command]
fn show_main(app: tauri::AppHandle) {
    // 트레이 팝업이 always_on_top이라, 여기서 직접 숨기지 않으면 메인 창을
    // show()+focus()해도 팝업이 그 위를 계속 덮고 있어 "눌러도 안 보인다"가 된다.
    // 팝업 자신의 포커스아웃 hide()에만 기대면 타이밍에 따라 이 순간을 놓칠 수 있다.
    if let Some(popup) = app.get_webview_window("tray") {
        let _ = popup.hide();
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// 단축키를 누를 때마다 부른다 — 떠 있으면 숨기고, 숨어 있으면 화면 가운데
/// 다시 띄운다(멀티 모니터에서 활성 모니터가 바뀌었을 수 있어 매번 center()한다).
fn toggle_quick_add(app: &tauri::AppHandle) {
    let Some(w) = app.get_webview_window("quickadd") else { return };
    // 껐다 켰다(toggle)로 했다가 뺐다 — 단축키를 살짝만 오래 눌러도 Windows가
    // 키 반복(auto-repeat)으로 Pressed를 여러 번 보내는데, 그때마다 보였다 숨었다를
    // 반복해서 사용자 입장에서는 "입력창이 사라졌다 나타났다" 하며 방금 친 글자가
    // 어디로 갔는지 알 수 없게 됐다. 이제는 항상 보이고 포커스를 준다 — 닫는 건
    // Esc나 저장 완료, 포커스아웃뿐이라 더 예측 가능하다.
    let _ = w.center();
    let _ = w.show();
    let _ = w.set_focus();
}

/// 퀵 입력창이 Esc를 누르거나 일정을 저장한 직후 스스로를 닫을 때 부른다.
#[tauri::command]
fn hide_quick_add(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("quickadd") {
        let _ = w.hide();
    }
}

/// 퀵 입력창에서 저장에 **성공했을 때만** 부른다. 메인 창은 별도 웹뷰라
/// 퀵 입력창이 만든 일정을 알 도리가 없다 — router.refresh()는 그 페이지를
/// 그린 React 트리 안에서만 뜻이 있어서 바깥(다른 웹뷰)에서는 못 부른다.
/// 그래서 메인 창에 직접 새로고침 스크립트를 흘려 넣는다. 취소(Esc)나
/// 단순 포커스아웃으로 닫힐 때는 안 부른다 — 아무것도 안 바뀌었는데
/// 화면을 새로고침하면 사용자가 보던 자리(스크롤 등)만 잃는다.
#[tauri::command]
fn refresh_main_and_hide_quick_add(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("quickadd") {
        let _ = w.hide();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.eval("window.location.reload()");
    }
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
/// `/api/settings`가 비어 있거나 못 받아 왔을 때만 쓰는 값. 화면에서 고르면
/// DB에 저장돼 이 기본값 대신 그 값을 매 폴링마다 읽어 온다.
const DEFAULT_REMIND_THRESHOLDS_MIN: [i64; 2] = [60, 15];

/// "1시간마다 알림"이 뜰 때 이 중 하나를 무작위로 고른다 — 매번 같은 말이면
/// 보름만 지나도 눈에 안 들어온다.
const HOURLY_PHRASES: [(&str, &str); 5] = [
    ("1시간째 달리는 중이시네요 🔥", "잠깐 스트레칭하고 다시 힘내봐요! 💪"),
    ("벌써 1시간이 지났어요 ⏰", "목도 한번 풀어주고, 물 한 잔 어때요? 🥤"),
    ("1시간 동안 진짜 고생하셨어요 👏", "잠깐 일어나서 몸 좀 풀어봐요! 🤸"),
    ("오늘도 열일 중이시네요 ✨", "잠깐 눈도 쉬고 스트레칭 한 번! 👀"),
    ("1시간 클리어! 🎯", "잠깐 기지개 켜고 다시 시작해봐요 🙆"),
];

/// 새 크레이트(rand) 없이 그때그때 시스템 시각의 나노초 자리로 고른다 —
/// 알림 문구를 무작위로 섞는 정도라 암호학적 품질까지는 필요 없다.
fn random_hourly_phrase() -> (&'static str, &'static str) {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    HOURLY_PHRASES[(nanos as usize) % HOURLY_PHRASES.len()]
}

#[derive(Deserialize, Default)]
struct SettingsResponse {
    #[serde(rename = "reminderThresholds")]
    reminder_thresholds: Vec<i64>,
    #[serde(rename = "hourlyChime", default)]
    hourly_chime: bool,
}

/// 화면의 '알림 시점'·'1시간마다 알림' 체크박스가 저장한 값을 그대로 읽어 온다.
/// 앱을 다시 켤 필요 없이 다음 폴링(최대 30초 뒤)부터 반영되게 하려고 매번 새로 불러온다.
fn fetch_settings() -> SettingsResponse {
    let url = format!("http://127.0.0.1:{SERVER_PORT}/api/settings");
    let mut s: SettingsResponse = ureq::get(&url)
        .call()
        .ok()
        .and_then(|r| r.into_json().ok())
        .unwrap_or_default();
    if s.reminder_thresholds.is_empty() {
        s.reminder_thresholds = DEFAULT_REMIND_THRESHOLDS_MIN.to_vec();
    }
    s
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
    // 스트레칭 알림 기준 — 앱을 켠 시점(이 스레드가 시작된 시점)부터 흐른 시간.
    // 정각(예: 3시 정각)에 맞추는 게 아니라 실행 후 60분마다다. 한때 "창이 보이는
    // 시간만" 세는 50분짜리 알림을 따로 뒀는데, 알림이 두 종류로 나뉘어 헷갈리기만
    // 해서 하나(이 1시간짜리, 설정에서 켜고 끌 수 있다)로 합쳤다.
    let mut last_chime = std::time::Instant::now();

    loop {
        thread::sleep(POLL_INTERVAL);

        let today = Local::now().format("%Y-%m-%d").to_string();
        if today != notified_date {
            notified.clear();
            notified_date = today.clone();
        }

        let settings = fetch_settings();

        if let Ok(events) = fetch_today_events(&today) {
            let thresholds = settings.reminder_thresholds.clone();
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

        // 꺼져 있는 동안에도 시간은 그대로 흘러서, 나중에 켜면 그 자리에서 바로
        // 한 번 울릴 수 있다 — 그것도 무해하다.
        if settings.hourly_chime && last_chime.elapsed() >= Duration::from_secs(3600) {
            let (title, body) = random_hourly_phrase();
            let _ = app
                .notification()
                .builder()
                .title(title)
                .body(format!("{body} (현재 {})", Local::now().format("%H:%M")))
                .show();
            last_chime = std::time::Instant::now();
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
