use tauri::Emitter;

#[cfg(target_os = "macos")]
pub fn init(app_handle: &tauri::AppHandle) {
    use std::sync::Mutex;
    use std::sync::Arc;

    // Key codes for multimedia keys (macOS)
    const kVK_PlayPause: u8 = 0xFD;
    const kVK_NextTrack: u8 = 0xF9;
    const kVK_PreviousTrack: u8 = 0xF6;

    type EventHandlerCallRef = *mut libc::c_void;
    type EventRef = *mut objc2_foundation::NSObject;

    // CGEventTapCreate from CoreFoundation.framework
    extern "C" {
        fn CFMachPortCreateRunLoopSource(
            allocator: *mut objc2_foundation::NSObject,
            tap: *mut objc2_foundation::NSObject,
            order: i32,
        ) -> *mut objc2_foundation::NSObject;

        fn CFRunLoopAddSource(runloop: *mut objc2_foundation::NSObject, source: *mut objc2_foundation::NSObject, mode: *mut objc2_foundation::NSString);

        fn CGEventTapCreate(
            tap: u32,
            place: u32,
            options: u32,
            eventsOfInterest: u64,
            callback: Option<unsafe extern "C" fn(*mut objc2_foundation::NSObject, u32, EventRef) -> EventRef>,
            userInfo: *mut libc::c_void,
        ) -> *mut objc2_foundation::NSObject;

        fn CGEventPost(tap: u32, event: EventRef);

        fn CFRunLoopRun();
    }

    #[repr(C)]
    struct HotKeyEventData {
        app_handle: Arc<Mutex<Option<tauri::AppHandle>>>,
    }

    // Callback function for media key events
    extern "C" fn hot_key_callback(
        _tap: *mut objc2_foundation::NSObject,
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
            (1 << kVK_PlayPause) | (1 << kVK_NextTrack) | (1 << kVK_PreviousTrack),
            Some(hot_key_callback),
            std::ptr::null_mut(),
        );

        if !tap.is_null() {
            use objc2_foundation::{NSRunLoop, NSString};
            let runloop = NSRunLoop::main_loop();
            let source = CFMachPortCreateRunLoopSource(std::ptr::null_mut(), tap, 0);
            let mode = NSString::alloc().init_with_c_str("kCFRunLoopDefaultMode");
            CFRunLoopAddSource(runloop, source, mode.as_ref());
        }

        // Leak the user_data pointer so it lives for the app lifetime
        std::mem::forget(user_data_ptr);
    }
}

#[cfg(not(target_os = "macos"))]
pub fn init(_app_handle: &tauri::AppHandle) {}
