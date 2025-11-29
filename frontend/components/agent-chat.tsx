"use client"

import { useMemo, useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/auth-context"
import { runAgentChat, type AgentChatResponse } from "@/lib/api"

type ChatMessage = {
  id: string
  role: "user" | "agent"
  content: string
  timestamp: string
}

const formatAgentResponse = (payload: AgentChatResponse) => {
  if (!payload) return "No response generated."

  const lines: string[] = []

  if (payload.summary) {
    lines.push(`📋 Summary: ${payload.summary}`)
  }
  if (payload.surgeProbabilityInsight) {
    lines.push(`\n📊 Surge Insight: ${payload.surgeProbabilityInsight}`)
  }
  if (payload.staffingPlan) {
    lines.push(`\n👥 Staffing Plan: ${payload.staffingPlan}`)
  }
  if (payload.supplyPlan) {
    lines.push(`\n📦 Supply Plan: ${payload.supplyPlan}`)
  }
  if (payload.suggestedMedicines?.length) {
    lines.push(`\n💊 Suggested Medicines:`)
    payload.suggestedMedicines.forEach((medicine) => {
      lines.push(`  • ${medicine}`)
    })
  }
  if (payload.suggestedDiseases?.length) {
    lines.push(`\n🦠 Potential Diseases:`)
    payload.suggestedDiseases.forEach((disease) => {
      lines.push(`  • ${disease}`)
    })
  }
  if (payload.weatherImpact) {
    lines.push(`\n🌤️ Weather Impact: ${payload.weatherImpact}`)
  }
  if (payload.aqiImpact) {
    lines.push(`\n🌬️ Air Quality Impact: ${payload.aqiImpact}`)
  }
  if (payload.suggestedActions?.length) {
    lines.push(`\n✅ Suggested Actions:`)
    payload.suggestedActions.forEach((action, idx) => {
      lines.push(`  ${idx + 1}. ${action}`)
    })
  }
  if (payload.confidence) {
    lines.push(`\n🎯 Confidence: ${payload.confidence}`)
  }

  return lines.join("\n")
}

const newMessage = (role: ChatMessage["role"], content: string): ChatMessage => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  role,
  content,
  timestamp: new Date().toISOString(),
})

interface AgentChatPanelProps {
  region: string
  timeRange: string
  dataType: string
}

export function AgentChatPanel({ region, timeRange, dataType }: AgentChatPanelProps) {
  const { toast } = useToast()
  const { token, isAuthenticated } = useAuth()
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([
    newMessage(
      "agent",
      "Hi! I'm the MediOps AI agent. Ask me about predicted surges, staffing, or supply readiness for your selected region."
    ),
  ])
  const [loading, setLoading] = useState(false)

  const contextPayload = useMemo(
    () => ({
      region,
      timeRange,
      dataType,
      uiTimestamp: new Date().toISOString(),
    }),
    [region, timeRange, dataType]
  )

  const sendMessage = async () => {
    if (!input.trim()) {
      toast({
        title: "Enter a question",
        description: "Type a question or request before sending.",
      })
      return
    }

    if (!token || !isAuthenticated) {
      toast({
        title: "Authentication required",
        description: "Sign in to talk to the MediOps AI agent.",
        variant: "destructive",
      })
      return
    }

    const outbound = newMessage("user", input.trim())
    setMessages((prev) => [...prev, outbound])
    setInput("")

    try {
      setLoading(true)
      const response = await runAgentChat(token, {
        message: outbound.content,
        context: contextPayload,
      })

      if (!response.success || !response.data) {
        throw new Error(response.message || "Agent response unavailable")
      }

      const formatted = formatAgentResponse(response.data)
      setMessages((prev) => [...prev, newMessage("agent", formatted)])
    } catch (error) {
      console.error("Agent chat error:", error)
      toast({
        title: "Agent unavailable",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>AI Operations Agent</CardTitle>
            <CardDescription>
              Conversational guidance tailored to {region} · timeframe: {timeRange}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ScrollArea className="h-64 w-full rounded-md border border-border bg-muted/40 p-3">
          <div className="space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                  message.role === "agent"
                    ? "bg-primary/10 text-primary-foreground"
                    : "bg-card text-foreground border border-border"
                }`}
              >
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                  {message.role === "agent" ? "MediOps AI" : "You"}
                </div>
                {message.content}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="space-y-3">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask for staffing advice, expected surges, or supply planning…"
            disabled={loading}
            className="min-h-[120px]"
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {isAuthenticated ? "Responses generated using Ai Agent" : "Sign in to enable MediOps AI"}
            </p>
            <Button onClick={sendMessage} disabled={loading || !isAuthenticated}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating
                </>
              ) : (
                "Ask MediOps AI"
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}




