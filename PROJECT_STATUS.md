# 여행온 프로젝트 작업 기록

최종 정리일: 2026-07-18  
프로젝트 폴더: `C:\Users\jys78\youtube\travel-app`

## 1. 프로젝트 개요

기존 하노이 가족여행 HTML을 기반으로 시작한 설치형 여행 PWA/Android 앱이다.

- 서비스 이름 후보 확정: **여행온 (Travel ON)**
- 현재 Android 패키지: `com.james.hanoitrip`
- 현재 Capacitor 앱 이름: `Hanoi Trip`
- 여행 일정: 2026년 9월 10일~13일, 하노이 4인 가족여행
- 운영 주소: <https://travel-app-six-opal.vercel.app>
- 상세 일정 주소: <https://travel-app-six-opal.vercel.app/hanoi-trip.html>

`여행온` 이름은 Android 설치 이름, Capacitor 앱 이름, PWA manifest와 브라우저 제목에 적용했다.

## 2. 기술 구성

- React 19
- Vite 8
- JavaScript
- PWA (`vite-plugin-pwa`)
- Capacitor Android 8
- Vercel 자동 웹 배포
- Android 네이티브 Java 플러그인
- Google ML Kit 온디바이스 OCR

주요 파일:

- `src/App.jsx`: 메인 화면
- `src/components/TripCard.jsx`: 메인 여행 카드
- `src/data/trips.js`: 하노이 여행 기본 데이터
- `public/hanoi-trip.html`: 실제 하노이 상세 일정과 대부분의 여행 기능
- `capacitor.config.json`: Android 앱이 운영 상세 일정 주소를 불러오는 설정
- `android/`: Android Studio 프로젝트

## 3. 현재 구현 기능

### 메인 화면

- 하노이 가족여행 카드
- D-Day, 여행 기간, 인원 표시
- 메인 여행 카드 내부 예산 요약
  - 숙소 `₩765,669`
  - 현금 `9,040,000₫`
  - 현지카드 `4,300,000₫`
  - 항공 `₩1,410,071`
- 일정 만들기
- 장소 저장
- 새 여행 만들기
- 입력 데이터 LocalStorage 저장

### 상세 일정 화면

- 4일 일정과 날짜 탭
- 날씨와 Google Lens를 2열로 표시
- 오늘의 환율 가로 한 줄 표시
  - `₩50,000 → VND`
  - `$100 → VND`
- 환전 계산기 가로 한 줄 표시
- 실시간 Open-Meteo 날씨
- 실시간 환율 API
- 일정 완료 체크
- 완료 시 실제 사용 금액 확인·수정
- 경비와 메모 저장
- 일정별 사진 저장
- 영수증 촬영 및 OCR 금액 자동입력
- Google Maps 경로 연결
- 일정 알림
- 다크 모드
- PWA 설치와 오프라인 캐시
- 상세 일정의 중복 예산 바 제거

### Google Lens

- 목표: 설치된 독립 Google Lens 앱(`com.google.ar.lens`) 실행
- 휴대폰에서 정상 호출되는 버전: **Hanoi Trip 1.1 / versionCode 2**
- Lens 실행 후 하단 `번역`을 선택해 메뉴판을 카메라로 번역
- Google은 외부 앱이 Lens의 번역 탭까지 강제로 선택하는 공식 딥링크를 제공하지 않으므로 번역 탭을 한 번 눌러야 할 수 있다.

### 영수증 OCR

- Android ML Kit `com.google.mlkit:text-recognition:16.0.1`
- 온디바이스 방식이므로 인식 자체는 오프라인 가능
- `TOTAL`, `GRAND TOTAL`, `THÀNH TIỀN`, `TỔNG`, `합계`, `결제금액` 우선 인식
- 소계, VAT, 세금, 거스름돈 제외
- 인식 금액을 실제 지출 입력란에 넣고 사용자가 수정 후 완료 가능

## 4. 데이터 저장 현황

현재 서버 DB는 없다.

- 일정·경비·체크·메모: LocalStorage
- 일정별 사진·영수증 사진: IndexedDB
- 날씨·환율: LocalStorage 캐시

제약:

- 앱 데이터 삭제 시 기록 손실 가능
- 휴대폰 변경 시 자동 이전 불가
- PC·아이맥·휴대폰 사이 동기화 없음
- 사용자 로그인과 공유 기능 없음

## 5. 배포 및 APK

### 웹 배포

```powershell
npm.cmd run build
npx.cmd vercel --prod --yes
```

운영 별칭:

```text
https://travel-app-six-opal.vercel.app
```

Capacitor는 운영 상세 일정 URL을 직접 불러오므로 일반 HTML/CSS/JS 변경은 APK를 다시 만들지 않아도 앱 재시작 후 반영된다.

### Android 빌드

```powershell
npm.cmd run build
npx.cmd cap sync android
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
Set-Location android
.\gradlew.bat assembleDebug
```

빌드 결과:

```text
android\app\build\outputs\apk\debug\app-debug.apk
```

ADB:

```text
%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe
```

### 안정 버전

- 휴대폰과 PC 에뮬레이터에서 적용한 안정 버전: `1.1`, versionCode `2`
- 로컬 보관 파일: `android\hanoi-trip-v1.1.previous.apk`
- 에뮬레이터 패키지: `com.james.hanoitrip`

### 현재 소스의 주의사항

- 현재 `android/app/build.gradle`은 다음 실험 버전인 `1.2`, versionCode `3`으로 올라가 있다.
- `public/downloads/hanoi-trip-v7-lens-v1.2.apk`도 생성되어 있다.
- 사용자가 `1.1`에서 Lens 호출이 정상이라고 확인했으므로, **1.2를 정식 안정 버전으로 교체하기 전에 실제 휴대폰 검증이 필요하다.**
- 동일 APK 파일명을 재사용하면 모바일 브라우저/메신저 캐시로 이전 APK가 내려올 수 있다. 이후에는 버전이 포함된 새 파일명을 사용한다.

## 6. 앱 아이콘 시안

이미지 생성으로 다음 시안을 만들었다.

1. 위치 핀 + 여행 경로 + ON 심볼, 짙은 색 버전
2. 위치 핀 + 여행 경로 + ON 심볼, 밝은 하늘색 버전
3. 비행기 + 기차 + 배 + 상승 여행 경로, 밝은 설렘 버전

3번 시안을 최종 방향으로 선택해 Android/PWA/Apple Touch 아이콘에 적용했다.

생성 원본 기본 위치:

```text
C:\Users\jys78\.codex\generated_images\019f6fd8-c816-70a0-b695-62997d805323\
```

주요 파일:

- `exec-71db8d51-35b6-4b5b-9a93-d671fbc596a9.png`
- `exec-c2487847-032f-4c0d-80e0-13832a91123d.png`
- `exec-0184f3f6-0a0b-48cb-b550-aca842253ca0.png`

아이콘 확정 후 프로젝트 `public`과 Android mipmap 폴더로 복사하고 규격별 아이콘을 생성해야 한다.

## 7. 다음 개발 목표: 클라우드 DB

추천 플랫폼: Supabase

계획:

1. Supabase 프로젝트 생성
2. 이메일 및 Google 로그인
3. 사용자 프로필
4. 여행, 일정, 장소, 경비 테이블
5. 여행 소유자·공동 편집자·읽기 전용 참여자 권한
6. 초대 링크 또는 이메일 초대
7. 사진과 영수증을 Supabase Storage로 이전
8. LocalStorage/IndexedDB 데이터를 클라우드로 마이그레이션
9. 오프라인 저장 후 재연결 시 동기화
10. 일정 Excel `.xlsx` 다운로드
11. Excel 업로드 미리보기, 검증, 일정 반영
12. PC·아이맥·휴대폰 동기화 테스트

보안 원칙:

- Supabase anon 공개 키만 프런트엔드 환경 변수로 사용
- service role 키는 앱이나 GitHub에 저장하지 않음
- 모든 테이블에 RLS 적용
- 여행 참여자만 해당 여행 데이터 접근 가능

예상 핵심 테이블:

- `profiles`
- `trips`
- `trip_members`
- `schedule_items`
- `places`
- `expenses`
- `attachments`
- `invites`

## 8. 바로 이어서 할 작업

1. 여행온 1.2 Android 실기기 검증 및 안정 버전 확정
2. Supabase 프로젝트 생성과 `.env.local` 설정
3. DB 스키마 및 RLS 작성
4. 로그인 화면 구현
5. 공유와 Excel 입출력 구현

## 9. 작업 재개용 문장

다음 세션에서 아래처럼 요청하면 된다.

```text
PROJECT_STATUS.md 읽고 여행온 프로젝트 DB 작업을 이어서 진행해줘.
```
