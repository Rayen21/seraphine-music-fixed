use tauri::Emitter;

#[cfg(target_os = "macos")]
pub fn init(app_handle: &tauri::AppHandle) {
    use std::sync::{Mutex, Arc};

    // macOS virtual key codes for media keys (0xFD/0xFE/0xFF range)
    const kVK_PlayPause: u16 = 0xFD;   // 253
    const kVK_NextTrack: u16 = 0xFE;   // 254
    const kVK_PreviousTrack: u16 = 0xFF; // 255

    type EventRef = *mut std::ffi::c_void;

    extern "C" {
        fn CGEventTapCreate(
            tap: u32,
            place: u32,
            options: u32,
            eventsOfInterest: u64,
            callback: Option<unsafe extern "C" fn(*mut std::ffi::c_void, u32, EventRef) -> EventRef>,
            userInfo: *mut std::ffi::c_void,
        ) -> *mut std::ffi::c_void;

        fn CGEventPost(tap: u32, event: EventRef);

        fn CFMachPortCreateRunLoopSource(
            allocator: *mut std::ffi::c_void,
            tap: *mut std::ffi::c_void,
            order: i32,
        ) -> *mut std::ffi::c_void;

        fn CFRunLoopAddSource(
            runloop: *mut std::ffi::c_void,
            source: *mut std::ffi::c_void,
            mode: *const std::ffi::c_char,
        );

        fn CFRunLoopRun();

        fn CFRunLoopGetMain() -> *mut std::ffi::c_void;

        // Extract keycode from CGEvent
        fn CGEventGetIntegerValueField(event: EventRef, field: u32) -> libc::c_long;
    }

    const kCGSessionEventTap: u32 = 4;
    const kCGHeadInsertEventTap: u32 = 2;
    const kCGEventTapOptionDefault: u32 = 0;

    // Event type flags for CGEventTapCreate (not key codes!)
    const kCGEventKeyDown: u64 = 1 << 20;
    const kCGEventSystemDefined: u64 = 1 << 30;

    static mut EVENT_DATA: Option<Arc<Mutex<Option<tauri::AppHandle>>>> = None;

    extern "C" fn hot_key_callback(
        _tap: *mut std::ffi::c_void,
        _type_: u32,
        event: EventRef,
    ) -> EventRef {
        unsafe {
            let field = 0x100; // kCGKeyboardEventKeycode

            if _type_ == kCGEventSystemDefined as u32 {
                let keycode = CGEventGetIntegerValueField(event, field) as u16;

                match keycode {
                    kVK_PlayPause => {
                        if let Some(ref app_handle) = EVENT_DATA.as_ref().and_then(|d| d.lock().ok()).map(|g| &**g).flatten() {
                            app_handle.emit("media-key", "playpause").ok();
                        }
                    }
                    kVK_NextTrack => {
                        if let Some(ref app_handle) = EVENT_DATA.as_ref().and_then(|d| d.lock().ok()).map(|g| &**g).flatten() {
                            app_handle.emit("media-key", "nexttrack").ok();
                        }
                    }
                    kVK_PreviousTrack => {
                        if let Some(ref app_handle) = EVENT_DATA.as_ref().and_then(|d| d.lock().ok()).map(|g| &**g).flatten() {
                            app_handle.emit("media-key", "previoustrack").ok();
                        }
                    }
                    _ => {}
                }
            }
        }

        std::ptr::null_mut()
    }

    let data = Arc::new(Mutex::new(Some(app_handle.clone())));
    unsafe { EVENT_DATA = Some(data.clone()); }

    unsafe {
        let tap = CGEventTapCreate(
            kCGSessionEventTap,
            kCGHeadInsertEventTap,
            kCGEventTapOptionDefault,
            kCGEventKeyDown | kCGEventSystemDefined,
            Some(hot_key_callback),
            std::ptr::null_mut(),
        );

        if !tap.is_null() {
            let runloop = CFRunLoopGetMain();
            let source = CFMachPortCreateRunLoopSource(std::ptr::null_mut(), tap, 0);
            let mode = b"kCFRunLoopDefaultMode\0".as_ptr() as *const std::ffi::c_char;
            CFRunLoopAddSource(runloop, source, mode);
        }

        CGEventPost(kCGSessionEventTap, std::ptr::null_mut());
    }
}

#[cfg(not(target_os = "macos"))]
pub fn init(_app_handle: &tauri::AppHandle) {}