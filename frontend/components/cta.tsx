"use client"

export default function CTA() {
  return (
    <section id="cta" className="w-full py-20 bg-primary/5">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-4xl sm:text-5xl font-bold mb-6 text-balance">Ready to Transform Your Hospital?</h2>
        <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
          Join leading healthcare institutions using HealthHub to predict surges, optimize resources, and provide better
          patient care.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button className="px-8 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors">
            Start Free Trial
          </button>
          
          <button className="px-8 py-3 border border-foreground bg-transparent text-foreground dark:border-white relative group transition duration-200 rounded-lg font-medium">
            <div className="absolute bottom-0 right-0 bg-accent h-full w-full -z-10 group-hover:bottom-0 group-hover:right-0 transition-all duration-200 rounded-lg" />
            <span className="relative">Schedule Demo</span>
          </button>
        </div>
      </div>
    </section>
  )
}
