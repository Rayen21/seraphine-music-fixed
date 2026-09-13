use tauri::Emitter;

#[cfg(target_os = "macos")]
#[allow(deprecated)]
pub fn init(app_handle: &tauri::AppHandle) {
    use cocoa::base::id;
    use std::sync::Mutex;
    use std::sync::Arc;

    // Carbon Events opaque types (not exposed by Cocoa)
    type EventHotKeyID = u32;
    type EventHandlerRef = *mut libc::c_void;
    type EventTargetRef = id;
    type EventTypeSpec = u32;
    type EventHotKeyIDRef = *const EventHotKeyID;

    // Key codes for multimedia keys (macOS)
    const kVK_PlayPause: u8 = 0xFD;
    const kVK_NextTrack: u8 = 0xF9;
    const kVK_PreviousTrack: u8 = 0xF6;

    type EventHandlerCallRef = *mut libc::c_void;
    type EventRef = id;

    // RegisterEventHotKey from CoreServices.framework
    extern "C" {
        fn RegisterEventHotKey(
            hotKeyID: EventHotKeyID,
            eventMask: u32,
            handlerUPP: EventHandlerRef,
            target: EventTargetRef,
            cookie: *mut u32,
        ) -> i32;

        // SetEventHandler from CoreServices.framework
        fn SetEventHandler(
            target: EventTargetRef,
            handlerUPP: EventHandlerRef,
        ) -> i32;

        // GetEventDispatcherTarget returns the default event dispatcher target
        fn GetEventDispatcherTarget() -> EventTargetRef;
    }

    #[repr(C)]
    struct HotKeyEventData {
        app_handle: Arc<Mutex<Option<tauri::AppHandle>>>,
    }

    // Callback function for media key events
    extern "C" fn hot_key_callback(
        _call_ref: EventHandlerCallRef,
        _event: EventRef,
        user_data: *mut libc::c_void,
    ) -> i32 {
        let data = unsafe { &*(user_data as *const HotKeyEventData) };
        if let Some(app_handle) = data.app_handle.lock().unwrap().as_ref() {
            let _ = app_handle.emit("media-key", ());
        }
        0
    }

    // Store app handle for callback access
    let data = HotKeyEventData {
        app_handle: Arc::new(Mutex::new(Some(app_handle.clone()))),
    };
    let user_data_ptr = Box::into_raw(Box::new(data));

    // Create EventHotKeyID (signature, eventKind)
    let play_pause_id: EventHotKeyID = 1 << 16 | kVK_PlayPause as u32;
    let next_track_id: EventHotKeyID = 1 << 16 | kVK_NextTrack as u32;
    let prev_track_id: EventHotKeyID = 1 << 16 | kVK_PreviousTrack as u32;

    // Get the default event dispatcher target
    let target = unsafe { GetEventDispatcherTarget() };

    // Register hotkeys for play/pause, next, previous
    unsafe {
        RegisterEventHotKey(
            play_pause_id,
            0,
            hot_key_callback as EventHandlerRef,
            target,
            std::ptr::null_mut(),
        );
        RegisterEventHotKey(
            next_track_id,
            0,
            hot_key_callback as EventHandlerRef,
            target,
            std::ptr::null_mut(),
        );
        RegisterEventHotKey(
            prev_track_id,
            0,
            hot_key_callback as EventHandlerRef,
            target,
            std::ptr::null_mut(),
        );

        // Set up the event handler
        SetEventHandler(target, hot_key_callback as EventHandlerRef);
    }

    // Leak the user_data pointer so it lives for the app lifetime
    std::mem::forget(user_data_ptr);
}

#[cfg(not(target_os = "macos"))]
pub fn init(_app_handle: &tauri::AppHandle) {}
