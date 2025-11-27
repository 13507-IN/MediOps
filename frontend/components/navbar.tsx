"use client"
import { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import {
  Navbar,
  NavBody,
  NavItems,
  MobileNav,
  NavbarLogo,
  NavbarButton,
  MobileNavHeader,
  MobileNavToggle,
  MobileNavMenu,
} from "@/components/ui/resizable-navbar"
import { ThemeToggle } from "@/components/theme-toggle"

export default function AppNavbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { isAuthenticated, logout } = useAuth()

  const isAuthPage = pathname === "/sign-in" || pathname === "/sign-up"

  if (isAuthPage) {
    return null
  }

  const navItems = [
    { name: "Home", link: "/" },
    { name: "Dashboard", link: "/dashboard" },
    { name: "Upload PDF", link: "/upload" },
    { name: "Predictions", link: "/predictions" },
    { name: "Resources", link: "/resources" },
  ]

  const handleLogout = () => {
    logout()
    router.push("/sign-in")
  }

  // Common button classes
  const buttonClasses = "font-medium rounded-lg transition-all duration-200 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2"

  return (
    <Navbar>
      {/* Desktop Navigation - Hidden on mobile */}
      <div className="hidden lg:block w-full">
        <NavBody>
          <NavbarLogo />
          <NavItems items={navItems} pathname={pathname} />
          <div className="flex items-center gap-4">
            <ThemeToggle />
            {!isAuthenticated ? (
              <NavbarButton 
                href="/sign-in" 
                className={`${buttonClasses} px-5 py-2.5 text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:shadow-md`}
              >
                Sign In
              </NavbarButton>
            ) : (
              <NavbarButton 
                onClick={handleLogout}
                className={`${buttonClasses} px-5 py-2.5 text-white bg-gradient-to-r from-red-500 to-red-600 hover:shadow-md`}
              >
                Logout
              </NavbarButton>
            )}
          </div>
        </NavBody>
      </div>

      {/* Mobile Navigation - Hidden on desktop */}
      <div className="lg:hidden w-full">
        <MobileNav>
          <MobileNavHeader>
            <NavbarLogo />
            <div className="flex items-center gap-4">
              <ThemeToggle />
              <MobileNavToggle 
                isOpen={isMobileMenuOpen} 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
              />
            </div>
          </MobileNavHeader>

          <MobileNavMenu isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)}>
            {navItems.map((item, idx) => {
              const isActive = pathname === item.link || 
                             (item.link !== '/' && pathname.startsWith(item.link));
              
              return (
                <a
                  key={`mobile-link-${idx}`}
                  href={item.link}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`block w-full px-4 py-3 text-base font-medium rounded-lg transition-colors ${
                    isActive 
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' 
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  {item.name}
                </a>
              );
            })}
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800 space-y-3">
              {!isAuthenticated ? (
                <>
                  <NavbarButton 
                    href="/sign-in" 
                    className="w-full justify-center text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                  >
                    Sign In
                  </NavbarButton>
                  <NavbarButton 
                    href="/sign-up" 
                    variant="secondary" 
                    className="w-full justify-center"
                  >
                    Sign Up
                  </NavbarButton>
                </>
              ) : (
                <NavbarButton 
                  onClick={handleLogout}
                  className="w-full justify-center text-white bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700"
                >
                  Logout
                </NavbarButton>
              )}
            </div>
          </MobileNavMenu>
        </MobileNav>
      </div>
    </Navbar>
  )
}