"use client"
import { cn } from "@/lib/utils"
import { IconMenu2, IconX } from "@tabler/icons-react"
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from "motion/react"
import { type VariantProps } from "class-variance-authority"
import { buttonVariants } from "./button"

import React, { useRef, useState } from "react"

interface NavbarProps {
  children: React.ReactNode
  className?: string
}

interface NavBodyProps {
  children: React.ReactNode
  className?: string
  isScrolled?: boolean
}

interface NavItemsProps {
  items: {
    name: string
    link: string
  }[]
  className?: string
  onItemClick?: () => void
  pathname: string
}

interface MobileNavProps {
  children: React.ReactNode
  className?: string
  isScrolled?: boolean
}

interface MobileNavHeaderProps {
  children: React.ReactNode
  className?: string
}

interface MobileNavMenuProps {
  children: React.ReactNode
  className?: string
  isOpen: boolean
  onClose: () => void
}

export const Navbar = ({ children, className }: NavbarProps) => {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollY } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  })
  const [isScrolled, setIsScrolled] = useState<boolean>(false)

  useMotionValueEvent(scrollY, "change", (latest) => {
    setIsScrolled(latest > 50) // Reduced threshold for earlier effect
  })

  return (
    <motion.div 
      ref={ref} 
      className={cn(
        "sticky inset-x-0 top-0 z-50 w-full transition-all duration-300",
        isScrolled ? "py-1" : "py-4", // Reduced padding when scrolled
        isScrolled ? "shadow-lg" : "shadow-none",
        className
      )}
      style={{
        backgroundColor: isScrolled ? 'rgba(15, 23, 42, 0.9)' : 'transparent',
        backdropFilter: isScrolled ? 'blur(12px)' : 'none',
        transform: isScrolled ? 'translateY(0)' : 'translateY(0)',
        margin: isScrolled ? '1rem' : '0',
        borderRadius: isScrolled ? '12px' : '0',
        maxWidth: isScrolled ? 'calc(100% - 2rem)' : '100%',
        marginLeft: isScrolled ? 'auto' : '0',
        marginRight: isScrolled ? 'auto' : '0',
      }}
      animate={{
        opacity: isScrolled ? 0.98 : 1,
        scale: isScrolled ? 0.98 : 1,
      }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 25,
      }}
    >
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          const childProps: any = {};
          if (child.type === NavBody || child.type === MobileNav) {
            childProps.isScrolled = isScrolled;
          }
          return React.cloneElement(child, { ...childProps, key: 'nav-child' });
        }
        return child;
      })}
    </motion.div>
  )
}

export const NavBody = ({ children, className, isScrolled = false, ...props }: NavBodyProps) => {
  const motionProps = React.useMemo(() => ({
    initial: { y: 0, width: "100%" },
    animate: {
      width: isScrolled ? "100%" : "100%",
      y: isScrolled ? 0 : 0,
      padding: isScrolled ? '0.25rem 1rem' : '0.75rem 1.5rem',
    },
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 25,
    },
  }), [isScrolled]);

  return (
    <motion.div
      {...motionProps}
      className={cn(
        "relative z-[60] mx-auto flex flex-row items-center justify-between rounded-full transition-all duration-300",
        isScrolled ? "bg-white/90 dark:bg-neutral-950/90" : "bg-transparent",
        isScrolled ? "shadow-sm" : "shadow-none",
        className,
      )}
      style={{
        maxWidth: isScrolled ? "100%" : "100%",
        borderRadius: isScrolled ? '9999px' : '9999px',
      }}
    >
      {children}
    </motion.div>
  )
}

export const NavItems = ({ items, className, onItemClick, pathname }: NavItemsProps) => {
  const [hovered, setHovered] = useState<number | null>(null)

  return (
    <motion.div
      onMouseLeave={() => setHovered(null)}
      className={cn(
        "flex flex-1 flex-row items-center justify-center space-x-2 text-sm font-medium lg:space-x-2",
        className,
      )}
    >
      {items.map((item, idx) => {
        const isActive = pathname === item.link || 
                        (item.link !== '/' && pathname.startsWith(item.link))
        
        return (
          <a
            onMouseEnter={() => setHovered(idx)}
            onClick={onItemClick}
            className={cn(
              "relative px-4 py-2 transition-colors duration-200",
              isActive 
                ? "text-foreground font-semibold" 
                : "text-muted-foreground hover:text-foreground"
            )}
            key={`link-${idx}`}
            href={item.link}
          >
            {hovered === idx && !isActive && (
              <motion.div
                layoutId="hovered"
                className="absolute inset-0 h-full w-full rounded-full bg-accent/10"
              />
            )}
            {isActive && (
              <motion.div
                layoutId="active"
                className="absolute inset-0 h-full w-full rounded-full bg-primary/10"
              />
            )}
            <span className="relative z-20">{item.name}</span>
          </a>
        )
      })}
    </motion.div>
  )
}

export const MobileNav = ({ children, className, isScrolled = false, ...props }: MobileNavProps) => {
  return (
    <motion.div
      className={cn(
        "relative z-50 mx-auto flex flex-col items-center justify-between bg-transparent px-0 py-2 lg:hidden transition-all duration-300",
        isScrolled ? "bg-white/80 dark:bg-neutral-950/80" : "bg-transparent",
        className,
      )}
      style={{
        maxWidth: isScrolled ? "95%" : "calc(100vw - 2rem)",
        borderRadius: isScrolled ? "1rem" : "2rem",
        padding: isScrolled ? "0.5rem" : "0",
      }}
    >
      {children}
    </motion.div>
  )
}

export const MobileNavHeader = ({ children, className }: MobileNavHeaderProps) => {
  return <div className={cn("flex w-full flex-row items-center justify-between", className)}>{children}</div>
}

export const MobileNavMenu = ({ children, className, isOpen, onClose }: MobileNavMenuProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn(
            "absolute inset-x-0 top-16 z-50 flex w-full flex-col items-start justify-start gap-4 rounded-lg bg-white px-4 py-8 shadow-[0_0_24px_rgba(34,_42,_53,_0.06),_0_1px_1px_rgba(0,_0,_0,_0.05),_0_0_0_1px_rgba(34,_42,_53,_0.04),_0_0_4px_rgba(34,_42,_53,_0.08),_0_16px_68px_rgba(47,_48,_55,_0.05),_0_1px_0_rgba(255,_255,_255,_0.1)_inset] dark:bg-neutral-950",
            className,
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export const MobileNavToggle = ({
  isOpen,
  onClick,
}: {
  isOpen: boolean
  onClick: () => void
}) => {
  return isOpen ? (
    <IconX className="text-black dark:text-white" onClick={onClick} />
  ) : (
    <IconMenu2 className="text-black dark:text-white" onClick={onClick} />
  )
}

export const NavbarLogo = () => {
  return (
    <a href="/" className="relative z-20 flex items-center space-x-2 px-2 py-1">
      <div className="flex items-center justify-center h-9 w-9 overflow-hidden">
        <img 
          src="/logo.png" 
          alt="MediOps Logo" 
          className="h-10 w-10 object-contain"
        />
      </div>
      <span className="text-lg font-bold text-black dark:text-white">MediOps</span>
    </a>
  )
}

type NavbarButtonVariant = "primary" | "secondary" | "dark" | "gradient"

interface NavbarButtonSharedProps {
  children: React.ReactNode
  className?: string
  variant?: NavbarButtonVariant
}

type NavbarButtonAnchorProps = NavbarButtonSharedProps &
  React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string
  }

type NavbarButtonButtonProps = NavbarButtonSharedProps &
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: never
  }

type NavbarButtonProps = NavbarButtonAnchorProps | NavbarButtonButtonProps

const isAnchorNavbarButton = (props: NavbarButtonProps): props is NavbarButtonAnchorProps => {
  return typeof (props as NavbarButtonAnchorProps).href === "string"
}

export const NavbarButton = (props: NavbarButtonProps) => {
  const baseStyles =
    "px-4 py-2 rounded-md bg-white button bg-white text-black text-sm font-bold relative cursor-pointer hover:-translate-y-0.5 transition duration-200 inline-block text-center"

  const variantStyles: Record<NavbarButtonVariant, string> = {
    primary:
      "shadow-[0_0_24px_rgba(34,_42,_53,_0.06),_0_1px_1px_rgba(0,_0,_0,_0.05),_0_0_0_1px_rgba(34,_42,_53,_0.04),_0_0_4px_rgba(34,_42,_53,_0.08),_0_16px_68px_rgba(47,_48,_55,_0.05),_0_1px_0_rgba(255,_255,_255,_0.1)_inset]",
    secondary: "bg-transparent shadow-none dark:text-white",
    dark: "bg-black text-white shadow-[0_0_24px_rgba(34,_42,_53,_0.06),_0_1px_1px_rgba(0,_0,_0,_0.05),_0_0_0_1px_rgba(34,_42,_53,_0.04),_0_0_4px_rgba(34,_42,_53,_0.08),_0_16px_68px_rgba(47,_48,_55,_0.05),_0_1px_0_rgba(255,_255,_255,_0.1)_inset]",
    gradient:
      "bg-gradient-to-b from-blue-500 to-blue-700 text-white shadow-[0px_2px_0px_0px_rgba(255,255,255,0.3)_inset]",
  }

  if (isAnchorNavbarButton(props)) {
    const { children, className = "", variant = "primary", href, ...anchorProps } = props

    return (
      <a href={href} className={cn(baseStyles, variantStyles[variant], className)} {...anchorProps}>
        {children}
      </a>
    )
  }

  const { children, className = "", variant = "primary", ...buttonProps } = props

  return (
    <button className={cn(baseStyles, variantStyles[variant], className)} {...buttonProps}>
      {children}
    </button>
  )
}
