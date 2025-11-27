"use client"

import Link from "next/link"

import { BackgroundRippleEffect } from "@/components/ui/background-ripple-effect"

export default function Hero() {
  return (
    <section className="relative min-h-screen w-full overflow-hidden flex items-center justify-center">
      <BackgroundRippleEffect />

      <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        <div className="mb-6 inline-block">
          <span className="inline-flex items-center rounded-full bg-accent/10 px-4 py-1.5 text-sm font-medium text-accent border border-accent/20">
            ✨ Intelligent Healthcare Management
          </span>
        </div>

        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-balance mb-6">
          Predict. Prepare. <span className="text-primary">Protect.</span>
        </h1>

        <p className="text-lg sm:text-xl text-muted-foreground text-balance mb-8 max-w-2xl mx-auto">
          AI-powered healthcare management system that predicts patient surges, optimizes resources, and keeps your
          hospital prepared for any scenario.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/sign-up"
            className="px-8 py-3 border border-foreground bg-transparent text-foreground dark:border-black relative group transition duration-200 rounded-lg font-medium"
          >
            <div className="absolute bottom-0 right-0 bg-accent h-full w-full -z-10 group-hover:bottom-0 group-hover:right-0 transition-all duration-200 rounded-lg" />
            <span className="relative">Get Started</span>
          </Link>
          <button className="px-8 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors">
            Learn More
          </button>
        </div>
      </div>
    </section>
  )
}
