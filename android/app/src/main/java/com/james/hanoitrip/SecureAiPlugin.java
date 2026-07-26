package com.james.hanoitrip;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureAi")
public class SecureAiPlugin extends Plugin {
    private static final String KEY_ALIAS = "travelon_personal_ai_key_v1";
    private static final String STORE = "travelon_secure_ai";

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(STORE, Context.MODE_PRIVATE);
    }

    private SecretKey encryptionKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }

    private String safeProvider(PluginCall call) {
        String provider = call.getString("provider", "");
        return provider.matches("openai|gemini") ? provider : null;
    }

    @PluginMethod
    public void saveSecret(PluginCall call) {
        String provider = safeProvider(call);
        String secret = call.getString("secret", "").trim();
        if (provider == null || secret.length() < 16) { call.reject("올바르지 않은 서비스 또는 API 키입니다."); return; }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, encryptionKey());
            byte[] encrypted = cipher.doFinal(secret.getBytes(StandardCharsets.UTF_8));
            String value = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "." + Base64.encodeToString(encrypted, Base64.NO_WRAP);
            preferences().edit().putString(provider, value).apply();
            JSObject result = new JSObject(); result.put("saved", true); call.resolve(result);
        } catch (Exception error) { call.reject("기기 보안 저장소에 저장하지 못했습니다.", error); }
    }

    @PluginMethod
    public void hasSecret(PluginCall call) {
        String provider = safeProvider(call);
        if (provider == null) { call.reject("올바르지 않은 서비스입니다."); return; }
        JSObject result = new JSObject(); result.put("exists", preferences().contains(provider)); call.resolve(result);
    }

    @PluginMethod
    public void deleteSecret(PluginCall call) {
        String provider = safeProvider(call);
        if (provider == null) { call.reject("올바르지 않은 서비스입니다."); return; }
        preferences().edit().remove(provider).apply();
        JSObject result = new JSObject(); result.put("deleted", true); call.resolve(result);
    }
}
