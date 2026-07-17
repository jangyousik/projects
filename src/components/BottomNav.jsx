const navItems = [
  { icon: '⌂', label: '홈', active: true, href: '/' },
  { icon: '▣', label: '여행', href: '/hanoi-trip.html' },
  { icon: '♡', label: '저장', href: '#saved' },
  { icon: '⚙', label: '설정', href: '#settings' },
]

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="주요 메뉴">
      {navItems.map((item) => (
        <a
          className={item.active ? 'nav-item is-active' : 'nav-item'}
          href={item.href}
          key={item.label}
          aria-current={item.active ? 'page' : undefined}
        >
          <span aria-hidden="true">{item.icon}</span>
          {item.label}
        </a>
      ))}
    </nav>
  )
}
