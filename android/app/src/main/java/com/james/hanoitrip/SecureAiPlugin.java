package com.jys7867.travelon;

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
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.Executors;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONArray;
import org.json.JSONObject;

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

    private String readSecret(String provider) throws Exception {
        String stored = preferences().getString(provider, "");
        if (stored.isEmpty()) throw new IllegalStateException("개인 API 키가 연결되지 않았습니다.");
        String[] parts = stored.split("\\.", 2);
        if (parts.length != 2) throw new IllegalStateException("저장된 키를 읽을 수 없습니다.");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, encryptionKey(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }

    private JSONObject postJson(String endpoint, String headerName, String headerValue, JSONObject payload) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(20000);
        connection.setReadTimeout(60000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty(headerName, headerValue);
        try (OutputStream output = connection.getOutputStream()) {
            output.write(payload.toString().getBytes(StandardCharsets.UTF_8));
        }
        int status = connection.getResponseCode();
        InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
        StringBuilder text = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) text.append(line);
        }
        JSONObject body = new JSONObject(text.toString());
        if (status < 200 || status >= 300) {
            String message = body.optJSONObject("error") != null
                    ? body.optJSONObject("error").optString("message", "AI 서비스 요청에 실패했습니다.")
                    : "AI 서비스 요청에 실패했습니다.";
            throw new IllegalStateException(message);
        }
        return body;
    }

    private String cleanJsonText(String text) {
        String cleaned = text == null ? "" : text.trim();
        if (cleaned.startsWith("```")) {
            cleaned = cleaned.replaceFirst("^```(?:json)?\\s*", "").replaceFirst("\\s*```$", "");
        }
        return cleaned;
    }

    private String schedulePrompt(PluginCall call) {
        String note = call.getString("note", "").trim();
        JSObject trip = call.getObject("trip", new JSObject());
        String selectedDate = call.getString("selectedDate", trip.optString("startDate", ""));
        if (note.isEmpty() || trip.optString("startDate", "").isEmpty() || trip.optString("endDate", "").isEmpty()) {
            throw new IllegalArgumentException("일정 설명과 여행 기간이 필요합니다.");
        }
        return "다음 설명을 여행 일정 초안 JSON 하나로 정리하세요. JSON 외의 글은 출력하지 마세요.\n"
                + "필수 키: title,day_date,start_time,place_name,address_candidate,memo,estimated_cost,cost_category,"
                + "payment_method,cost_currency,reservation_status,reservation_site,reservation_reference,reservation_url,warnings.\n"
                + "허용값: cost_category=flight|accommodation|food|transport|activity|shopping|other, "
                + "payment_method=cash|card|either|prepaid, reservation_status=none|planned|booked|cancelled.\n"
                + "빈 선택 정보는 null, warnings는 문자열 배열, 금액이 없으면 0, 비용분류는 other, 결제방법은 either, "
                + "예약정보가 없으면 none을 사용하세요. 날짜가 없으면 선택 날짜를 사용하고 주소·금액·예약정보를 추측하지 마세요.\n"
                + "여행: " + trip.optString("title", "") + " / " + trip.optString("destination", "") + "\n"
                + "기간: " + trip.optString("startDate", "") + " ~ " + trip.optString("endDate", "") + "\n"
                + "선택 날짜: " + selectedDate + "\n기본 통화: " + trip.optString("currency", "USD")
                + "\n사용자 설명:\n" + note.substring(0, Math.min(note.length(), 3000));
    }

    private JSONObject callOpenAi(String secret, String prompt) throws Exception {
        JSONObject payload = new JSONObject()
                .put("model", "gpt-5.6-luna")
                .put("store", false)
                .put("input", prompt)
                .put("max_output_tokens", 1800);
        JSONObject body = postJson("https://api.openai.com/v1/responses", "Authorization", "Bearer " + secret, payload);
        String output = body.optString("output_text", "");
        if (output.isEmpty()) {
            JSONArray items = body.optJSONArray("output");
            if (items != null) for (int i = 0; i < items.length() && output.isEmpty(); i++) {
                JSONArray content = items.optJSONObject(i).optJSONArray("content");
                if (content != null) for (int j = 0; j < content.length(); j++) {
                    JSONObject part = content.optJSONObject(j);
                    if ("output_text".equals(part.optString("type"))) { output = part.optString("text"); break; }
                }
            }
        }
        if (output.isEmpty()) throw new IllegalStateException("AI가 일정 초안을 만들지 못했습니다.");
        return new JSONObject(cleanJsonText(output));
    }

    private JSONObject callGemini(String secret, String prompt) throws Exception {
        JSONObject payload = new JSONObject()
                .put("contents", new JSONArray().put(new JSONObject().put("parts",
                        new JSONArray().put(new JSONObject().put("text", prompt)))))
                .put("generationConfig", new JSONObject().put("responseMimeType", "application/json"));
        JSONObject body = postJson(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
                "x-goog-api-key", secret, payload);
        String output = body.getJSONArray("candidates").getJSONObject(0)
                .getJSONObject("content").getJSONArray("parts").getJSONObject(0).getString("text");
        return new JSONObject(cleanJsonText(output));
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

    @PluginMethod
    public void testConnection(PluginCall call) {
        String provider = safeProvider(call);
        if (provider == null) { call.reject("올바르지 않은 서비스입니다."); return; }
        Executors.newSingleThreadExecutor().execute(() -> {
            try {
                String secret = readSecret(provider);
                if ("openai".equals(provider)) {
                    postJson("https://api.openai.com/v1/responses", "Authorization", "Bearer " + secret,
                            new JSONObject().put("model", "gpt-5.6-luna").put("input", "OK만 답하세요.").put("max_output_tokens", 8));
                } else {
                    postJson("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
                            "x-goog-api-key", secret, new JSONObject().put("contents", new JSONArray().put(
                                    new JSONObject().put("parts", new JSONArray().put(new JSONObject().put("text", "OK만 답하세요."))))));
                }
                JSObject result = new JSObject(); result.put("connected", true); call.resolve(result);
            } catch (Exception error) { call.reject("연결 확인 실패: " + error.getMessage()); }
        });
    }

    @PluginMethod
    public void analyzeScheduleDraft(PluginCall call) {
        String provider = safeProvider(call);
        if (provider == null) { call.reject("올바르지 않은 서비스입니다."); return; }
        Executors.newSingleThreadExecutor().execute(() -> {
            try {
                String prompt = schedulePrompt(call);
                JSONObject draft = "openai".equals(provider)
                        ? callOpenAi(readSecret(provider), prompt)
                        : callGemini(readSecret(provider), prompt);
                JSObject result = new JSObject(); result.put("draft", draft); call.resolve(result);
            } catch (Exception error) { call.reject("개인 AI 일정 분석 실패: " + error.getMessage()); }
        });
    }
}
