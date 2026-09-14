use tauri::Emitter;

#[cfg(target_os = "macos")]
pub fn init(app_handle: &tauri::AppHandle) {
    use cocoa::base::{id, nil};
    use std::sync::Mutex;
    use std::sync::Arc;

    // Key codes for multimedia keys (macOS)
    const kVK_PlayPause: u8 = 0xFD;
    const kVK_NextTrack: u8 = 0xF9;
    const kVK_PreviousTrack: u8 = 0xF6;

    type EventHandlerCallRef = *mut libc::c_void;
    type EventRef = id;

    // CGEventTapCreate from CoreFoundation.framework
    extern "C" {
        fn CFMachPortCreateRunLoopSource(
            allocator: id,
            tap: id,
            order: i32,
        ) -> id;

        fn CFRunLoopAddSource(runloop: id, source: id, mode: id);

        fn CGEventTapCreate(
            tap: u32,
            place: u32,
            options: u32,
            eventsOfInterest: u64,
            callback: Option<unsafe extern "C" fn(id, u32, EventRef) -> EventRef>,
            userInfo: *mut libc::c_void,
        ) -> id;

        fn CGEventPost(tap: u32, event: EventRef);

        fn CFRunLoopRun();
    }

    #[repr(C)]
    struct HotKeyEventData {
        app_handle: Arc<Mutex<Option<tauri::AppHandle>>>,
    }

    // Callback function for media key events
    extern "C" fn hot_key_callback(
        _tap: id,
        _type_: u32,
        event: EventRef,
    ) -> EventRef {
        0
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

        if tap != nil {
            use cocoa::foundation::{NSRunLoop, NSString};
            let runloop = NSRunLoop::main_loop();
            let source = CFMachPortCreateRunLoopSource(nil, tap, 0);
            let mode = NSString::alloc(nil).init_str_("kCFRunLoopDefaultMode");
            CFRunLoopAddSource(runloop, source, mode);
        }

        // Leak the user_data pointer so it lives for the app lifetime
        std::mem::forget(user_data_ptr);
    }
}

#[cfg(not(target_os = "macos"))]
pub fn init(_app_handle: &tauri::AppHandle) {}
