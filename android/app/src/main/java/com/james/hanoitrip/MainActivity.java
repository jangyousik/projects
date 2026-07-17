package com.james.hanoitrip;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ReceiptOcrPlugin.class);
        registerPlugin(ExternalAppsPlugin.class);
        super.onCreate(savedInstanceState);
        getBridge().getWebView().addJavascriptInterface(new HanoiNativeInterface(), "HanoiNative");
    }

    public class HanoiNativeInterface {
        @JavascriptInterface
        public boolean openGoogleLens() {
            Intent intent = getPackageManager().getLaunchIntentForPackage("com.google.ar.lens");
            if (intent == null) return false;
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            runOnUiThread(() -> startActivity(intent));
            return true;
        }
    }
}
