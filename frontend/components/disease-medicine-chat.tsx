"use client"

import { useState } from "react"
import { Loader2, MessageSquare, Send } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/auth-context"
import { chatDiseaseMedicine } from "@/lib/api"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: string
}

interface DiseaseMedicineChatProps {
  region?: string
}

export function DiseaseMedicineChat({ region }: DiseaseMedicineChatProps) {
  const { toast } = useToast()
  const { token, isAuthenticated } = useAuth()
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hi! I'm your medical information assistant. Ask me about diseases, medicines, symptoms, treatments, or any health-related questions. I can provide information about disease names, medicine names, and suggestions based on current conditions.",
      timestamp: new Date().toISOString(),
    },
  ])
  const [loading, setLoading] = useState(false)

  const sendMessage = async () => {
    if (!input.trim()) {
      toast({
        title: "Enter a question",
        description: "Type your question before sending.",
      })
      return
    }

    if (!token || !isAuthenticated) {
      toast({
        title: "Authentication required",
        description: "Sign in to use the medical chatbot.",
        variant: "destructive",
      })
      return
    }

    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      content: input.trim(),
      timestamp: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")

    try {
      setLoading(true)
      const response = await chatDiseaseMedicine(token, userMessage.content, region)

      if (!response.success || !response.data) {
        throw new Error(response.message || "Failed to get answer")
      }

      const assistantMessage: ChatMessage = {
        id: `${Date.now()}-assistant`,
        role: "assistant",
        content: response.data.answer,
        timestamp: new Date().toISOString(),
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      console.error("Chat error:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to get answer",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>Disease & Medicine Assistant</CardTitle>
            <CardDescription>
              Ask about diseases, medicines, symptoms, and treatments
              {region && ` • Context: ${region}`}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ScrollArea className="h-80 w-full rounded-md border border-border bg-muted/40 p-3">
          <div className="space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                  message.role === "assistant"
                    ? "bg-primary/10 text-primary-foreground"
                    : "bg-card text-foreground border border-border"
                }`}
              >
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                  {message.role === "assistant" ? "Medical Assistant" : "You"}
                </div>
                {message.content}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Thinking...
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="space-y-3">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about diseases, medicines, symptoms, treatments... (e.g., 'What is asthma?', 'What medicines treat pneumonia?', 'Symptoms of heat stroke?')"
            disabled={loading}
            className="min-h-[100px]"
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {isAuthenticated
                ? "Using AI Agent • Provides medical information and suggestions"
                : "Sign in to use the medical chatbot"}
            </p>
            <Button onClick={sendMessage} disabled={loading || !isAuthenticated}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}















