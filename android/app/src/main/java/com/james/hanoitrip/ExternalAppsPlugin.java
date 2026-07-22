package com.james.hanoitrip;

import android.content.Intent;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ExternalApps")
public class ExternalAppsPlugin extends Plugin {
    private static final String GOOGLE_LENS_PACKAGE = "com.google.ar.lens";
    private static final String GOOGLE_TRANSLATE_PACKAGE = "com.google.android.apps.translate";
    private static final String GRAB_PACKAGE = "com.grabtaxi.passenger";

    @PluginMethod
    public void openGoogleLens(PluginCall call) {
        Intent launchIntent = getContext().getPackageManager().getLaunchIntentForPackage(GOOGLE_LENS_PACKAGE);
        if (launchIntent == null) {
            call.reject("Google Lens 앱을 찾을 수 없습니다.");
            return;
        }

        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(launchIntent);
        call.resolve();
    }

    @PluginMethod
    public void openGoogleTranslate(PluginCall call) {
        Intent launchIntent = getContext().getPackageManager().getLaunchIntentForPackage(GOOGLE_TRANSLATE_PACKAGE);
        if (launchIntent == null) {
            call.reject("Google 번역 앱을 찾을 수 없습니다.");
            return;
        }

        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(launchIntent);
        call.resolve();
    }

    @PluginMethod
    public void openGrab(PluginCall call) {
        Intent launchIntent = getContext().getPackageManager().getLaunchIntentForPackage(GRAB_PACKAGE);
        if (launchIntent == null) {
            call.reject("Grab 앱을 찾을 수 없습니다.");
            return;
        }

        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(launchIntent);
        call.resolve();
    }
}
