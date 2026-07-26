const navItems = [
  { icon: '⌂', label: '홈', screen: 'home' },
  { icon: '▣', label: '여행', screen: 'home' },
  { icon: '☁', label: '게시판', screen: 'community' },
  { icon: '⚙', label: '설정', screen: 'settings' },
]

export function BottomNav({ activeScreen = 'home', onNavigate }) {
  return (
    <nav className="bottom-nav" aria-label="주요 메뉴">
      {navItems.map((item) => (
        <button
          type="button"
          className={activeScreen === item.screen ? 'nav-item is-active' : 'nav-item'}
          onClick={() => onNavigate(item.screen)}
          key={item.label}
          aria-current={activeScreen === item.screen ? 'page' : undefined}
        >
          <span aria-hidden="true">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </nav>
  )
}
