fn main() {
  tauri_build::build();
  
  #[cfg(target_os = "macos")]
  println!("cargo:rustc-link-lib=framework=CoreServices");

  // CGEventTapCreate requires CoreGraphics
  #[cfg(target_os = "macos")]
  println!("cargo:rustc-link-lib=framework=CoreGraphics");
}