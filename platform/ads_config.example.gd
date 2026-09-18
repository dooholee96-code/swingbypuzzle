# 광고 단위 ID 형식 예시. docs/PLAN.md §14.2, §19
#
# 실제 값이 든 platform/ads_config.gd 는 **저장소에 커밋하지 않는다**(.gitignore).
# 이 파일을 복사해 ads_config.gd 로 만들고 값을 채운다.
#
# 개발·비공개 테스트 빌드는 반드시 구글이 제공하는 테스트 광고 ID 를 쓴다.
# 실제 광고 단위 ID 는 출시 빌드에서만.
class_name AdsConfigExample
extends RefCounted

# 구글 공식 테스트 ID (문서에 공개된 값이라 커밋해도 된다)
const TEST_REWARDED_ANDROID := "ca-app-pub-3940256099942544/5224354917"
const TEST_INTERSTITIAL_ANDROID := "ca-app-pub-3940256099942544/1033173712"

# 출시용 값은 여기에. 저장소에 올리지 않는다.
const REWARDED_ANDROID := ""
const INTERSTITIAL_ANDROID := ""
const REWARDED_IOS := ""
const INTERSTITIAL_IOS := ""
