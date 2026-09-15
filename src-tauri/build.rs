fn main() {
    // 앱 자체 커맨드(플러그인이 아니라 lib.rs의 #[tauri::command])는 이렇게
    // 목록으로 선언해야 build.rs가 `allow-<커맨드>`/`deny-<커맨드>` 권한을 만들어
    // 준다. 안 선언하면 capabilities에 아무리 적어도 참조할 권한 자체가 없어서,
    // 프런트에서 invoke할 때 "Command X not allowed by ACL"로 조용히 막힌다.
    let attributes = tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "set_opacity",
            "toggle_mini",
            "test_notification",
            "open_todo_widget",
            "save_ics_file",
        ]),
    );
    tauri_build::try_build(attributes).expect("tauri-build 실패");
}
