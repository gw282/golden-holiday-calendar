// 콘솔 숨김은 **실행 파일이 되는 이 크레이트(main.rs)**에 붙어야 한다.
// lib.rs에 있던 건 라이브러리 크레이트에만 적용돼 실제 .exe 서브시스템에
// 영향을 못 줬다 — 그래서 release 빌드에서도 콘솔창이 계속 떴다.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    mg_manage_lib::run();
}
