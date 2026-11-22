function Header() {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-6">
      <h2 className="text-lg font-semibold text-gray-800">
        Fleet Management
      </h2>

      <span className="text-sm text-gray-500">
        Welcome, Admin
      </span>
    </header>
  );
}

export default Header;