use tauri::Emitter;

#[cfg(target_os = "macos")]
pub fn init(app_handle: &tauri::AppHandle) {
    use std::sync::Mutex;
    use std::sync::Arc;

    // Key codes for multimedia keys (macOS) - 使用位掩码而非位移
    const kVK_PlayPause: u64 = 0x010000000000;
    const kVK_NextTrack: u64 = 0x008000000000;
    const kVK_PreviousTrack: u64 = 0x004000000000;

    type EventHandlerCallRef = *mut libc::c_void;
    type EventRef = *mut std::ffi::c_void;

    // CGEventTapCreate from CoreFoundation.framework
    extern "C" {
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

        fn CGEventTapCreate(
            tap: u32,
            place: u32,
            options: u32,
            eventsOfInterest: u64,
            callback: Option<unsafe extern "C" fn(*mut std::ffi::c_void, u32, EventRef) -> EventRef>,
            userInfo: *mut std::ffi::c_void,
        ) -> *mut std::ffi::c_void;

        fn CGEventPost(tap: u32, event: EventRef);

        fn CFRunLoopRun();
        
        fn CFRunLoopGetMain() -> *mut std::ffi::c_void;
    }

    #[repr(C)]
    struct HotKeyEventData {
        app_handle: Arc<Mutex<Option<tauri::AppHandle>>>,
    }

    // Callback function for media key events
    extern "C" fn hot_key_callback(
        _tap: *mut std::ffi::c_void,
        _type_: u32,
        event: EventRef,
    ) -> EventRef {
        std::ptr::null_mut()
    }

    // Store app handle for callback access
    let data = HotKeyEventData {
        app_handle: Arc::new(Mutex::new(Some(app_handle.clone()))),
    };
    let user_data_ptr = Box::into_raw(Box::new(data));

    // Create an event tap to capture media key events
    unsafe {
        let tap = CGEventTapCreate(
            1, // kCGSessionEventTap
            2, // kCGHeadInsertEventTap
            0, // kCGEventTapOptionDefault
            (kVK_PlayPause | kVK_NextTrack | kVK_PreviousTrack),
            Some(hot_key_callback),
            std::ptr::null_mut(),
        );

        if !tap.is_null() {
            let runloop = CFRunLoopGetMain();
            let source = CFMachPortCreateRunLoopSource(std::ptr::null_mut(), tap, 0);
            let mode = b"kCFRunLoopDefaultMode\0".as_ptr() as *const std::ffi::c_char;
            CFRunLoopAddSource(runloop, source, mode);
        }

        // Leak the user_data pointer so it lives for the app lifetime
        std::mem::forget(user_data_ptr);
    }
}

#[cfg(not(target_os = "macos"))]
pub fn init(_app_handle: &tauri::AppHandle) {}
