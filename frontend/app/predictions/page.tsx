"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { AgentChatPanel } from "@/components/agent-chat"
import { DiseaseMedicineChat } from "@/components/disease-medicine-chat"
import { useAuth } from "@/lib/auth-context"
import { getLatestPrediction, getPredictionHistory, downloadPredictions, generatePrediction, getAggregatedResources, type Prediction, type AqiReading, type WeatherReading } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { Download, RefreshCw, Loader2, MapPin, Navigation } from "lucide-react"
import { Input } from "@/components/ui/input"

// Default cities for quick selection
const defaultCities = ["Delhi", "Mumbai", "Bangalore", "Kolkata"]

export default function Predictions() {
  const { token, isAuthenticated } = useAuth()
  const { toast } = useToast()
  const [cityInput, setCityInput] = useState("")
  const [currentCity, setCurrentCity] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState("7days")
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [prediction, setPrediction] = useState<Prediction | null>(null)
  const [aqi, setAqi] = useState<AqiReading | null>(null)
  const [weather, setWeather] = useState<WeatherReading | null>(null)
  const [history, setHistory] = useState<Prediction[]>([])
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number; city: string } | null>(null)
  const [locationLoading, setLocationLoading] = useState(false)

  // Fetch city from resources on mount
  useEffect(() => {
    const fetchCityFromResources = async () => {
      if (token && isAuthenticated && !cityInput) {
        try {
          const resourcesRes = await getAggregatedResources(token)
          if (resourcesRes.success && resourcesRes.data?.city) {
            setCityInput(resourcesRes.data.city)
            toast({
              title: "City auto-filled",
              description: `City set to ${resourcesRes.data.city} from hospital address`,
            })
          }
        } catch (error) {
          console.error("Error fetching city from resources:", error)
        }
      }
    }
    fetchCityFromResources()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAuthenticated])

  // Get user's live location
  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({
        title: "Location not supported",
        description: "Geolocation is not supported by your browser",
        variant: "destructive",
      })
      return
    }

    setLocationLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        setUserLocation({ lat: latitude, lon: longitude, city: "" })
        
        // Try to reverse geocode to get city name using free Nominatim API
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`
          )
          if (response.ok) {
            const data = await response.json()
            if (data && data.address) {
              const cityName = data.address.city || data.address.town || data.address.village || data.address.county || "Unknown"
              setUserLocation({ lat: latitude, lon: longitude, city: cityName })
              setCityInput(cityName)
              toast({
                title: "Location detected",
                description: `City set to: ${cityName}. Click Submit to load data.`,
              })
            } else {
              setUserLocation({ lat: latitude, lon: longitude, city: "" })
              toast({
                title: "Location detected",
                description: "Please enter city name manually.",
              })
            }
          }
        } catch (error) {
          console.error("Reverse geocoding error:", error)
          setUserLocation({ lat: latitude, lon: longitude, city: "" })
          toast({
            title: "Location detected",
            description: "Please enter city name manually.",
          })
        } finally {
          setLocationLoading(false)
        }
      },
      (error) => {
        const errorMessage = error?.message || error?.code === 1 ? "Location access denied by user" 
          : error?.code === 2 ? "Location unavailable" 
          : error?.code === 3 ? "Location request timeout" 
          : "Unable to get location"
        console.error("Geolocation error:", errorMessage, error)
        toast({
          title: "Location unavailable",
          description: errorMessage + ". Please enter city name manually.",
          variant: "destructive",
        })
        setLocationLoading(false)
      },
      {
        timeout: 10000,
        enableHighAccuracy: false,
      }
    )
  }

  const handleSubmitCity = async () => {
    let city = cityInput.trim()
    if (!city) {
      toast({
        title: "City required",
        description: "Please enter a city name",
        variant: "destructive",
      })
      return
    }

    // Auto-correct city name on the frontend (basic correction)
    const cityCorrections: Record<string, string> = {
      'kolkato': 'Kolkata',
      'kolkatta': 'Kolkata',
      'calcutta': 'Kolkata',
      'bombay': 'Mumbai',
      'new delhi': 'Delhi',
      'bengaluru': 'Bangalore',
      'madras': 'Chennai',
      'cochin': 'Kochi',
      'mysuru': 'Mysore',
    }
    const correctedCity = cityCorrections[city.toLowerCase()] || city
    if (correctedCity !== city) {
      setCityInput(correctedCity)
      city = correctedCity
      toast({
        title: "City corrected",
        description: `Corrected to: ${correctedCity}`,
      })
    }

    if (!token || !isAuthenticated) {
      toast({
        title: "Authentication required",
        description: "Please log in to view predictions",
        variant: "destructive",
      })
      return
    }

    setCurrentCity(city)
    await fetchData(city, true)
  }

  const fetchData = async (city: string, forceRefresh = false) => {
    if (!token || !isAuthenticated || !city) {
      setLoading(false)
      return
    }

    try {
      setRefreshing(true)
      setLoading(true)
      
      // Always generate a new prediction when city is submitted
      // This ensures we get fresh data
      try {
        const generateRes = await generatePrediction(token, city);
        if (generateRes.success && generateRes.data) {
          setPrediction(generateRes.data);
        }
      } catch (genError) {
        console.error("Error generating prediction:", genError);
        // Continue to try fetching latest
      }
      
      // Fetch latest prediction with real-time data
      const latestRes = await getLatestPrediction(token, city)
      if (latestRes.success && latestRes.data) {
        setPrediction(latestRes.data.prediction)
        setAqi(latestRes.data.aqi)
        setWeather(latestRes.data.weather)
        toast({
          title: "Success",
          description: `Data loaded for ${city}`,
        })
      } else {
        toast({
          title: "Info",
          description: latestRes.message || "Generating prediction for " + city + "...",
        })
      }

      // Fetch history
      const days = timeRange === "7days" ? 7 : timeRange === "30days" ? 30 : 90
      const historyRes = await getPredictionHistory(token, city, days)
      if (historyRes.success && historyRes.data) {
        setHistory(historyRes.data)
      }
    } catch (error) {
      console.error("Error fetching data:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch prediction data",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Only fetch history when timeRange changes (if we have a city)
  useEffect(() => {
    if (token && isAuthenticated && currentCity && prediction) {
      const days = timeRange === "7days" ? 7 : timeRange === "30days" ? 30 : 90
      getPredictionHistory(token, currentCity, days).then(historyRes => {
        if (historyRes.success && historyRes.data) {
          setHistory(historyRes.data)
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange, currentCity, token, isAuthenticated])

  const handleDownload = async () => {
    if (!token || !isAuthenticated || !currentCity) {
      toast({
        title: "City required",
        description: "Please enter and submit a city name first",
        variant: "destructive",
      })
      return
    }

    try {
      const days = timeRange === "7days" ? 7 : timeRange === "30days" ? 30 : 90
      const blob = await downloadPredictions(token, currentCity, days)
      
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `mediops-predictions-${currentCity}-${new Date().toISOString().split('T')[0]}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast({
        title: "Success",
        description: "Data downloaded successfully",
      })
    } catch (error) {
      console.error("Download error:", error)
      toast({
        title: "Error",
        description: "Failed to download data",
        variant: "destructive",
      })
    }
  }

  // Prepare chart data
  const chartData = history && history.length > 0 
    ? history.slice(0, 10).reverse().map((p) => ({
        date: new Date(p.date).toLocaleDateString(),
        surgeProbability: p.surgeProbability,
        doctors: p.staffAdvice?.doctors || 0,
        nurses: p.staffAdvice?.nurses || 0,
      }))
    : []

  // Prepare AQI and Weather history data for charts
  const aqiHistoryData = history && history.length > 0
    ? history.slice(0, 10).reverse().map((p, idx) => {
        // Try to get AQI from prediction data or use default
        const aqiValue = p.inputSnapshot?.aqi || (aqi?.aqi || 50)
        return {
          date: new Date(p.date).toLocaleDateString(),
          aqi: aqiValue,
          pm25: p.inputSnapshot?.pm25 || (aqi?.pm25 || 25),
          pm10: p.inputSnapshot?.pm10 || (aqi?.pm10 || 50),
        }
      })
    : []

  const weatherHistoryData = history && history.length > 0
    ? history.slice(0, 10).reverse().map((p) => {
        const temp = p.inputSnapshot?.temperature || (weather?.temperature || 25)
        const humidity = p.inputSnapshot?.humidity || (weather?.humidity || 60)
        return {
          date: new Date(p.date).toLocaleDateString(),
          temperature: temp,
          humidity: humidity,
          windSpeed: p.inputSnapshot?.windSpeed || (weather?.windSpeed || 10),
        }
      })
    : []

  const aqiStatus = aqi ? (aqi.aqi > 150 ? "Unhealthy" : aqi.aqi > 100 ? "Moderate" : "Good") : "Unknown"
  const aqiColor = aqi ? (aqi.aqi > 150 ? "text-red-600" : aqi.aqi > 100 ? "text-yellow-600" : "text-green-600") : "text-gray-600"

  // Show loading only when actively fetching data
  if (loading && !prediction) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted p-4 md:p-8 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading predictions for {currentCity}...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
          <h1 className="text-4xl font-bold text-foreground mb-2">Predictions & Analytics</h1>
            <p className="text-muted-foreground">AI-powered forecasting with real-time data</p>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={() => currentCity && fetchData(currentCity, true)} 
              disabled={refreshing || !currentCity} 
              variant="outline"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={handleDownload} disabled={!isAuthenticated || !currentCity}>
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </div>
        </div>

        {/* City Input */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="border-border md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Enter City Name</CardTitle>
              <CardDescription className="text-xs">Enter a city name to view predictions and analytics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={cityInput}
                  onChange={(e) => setCityInput(e.target.value)}
                  placeholder="Enter city name (e.g., Delhi, Mumbai, New York, London)"
                  className="w-full"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && cityInput.trim()) {
                      handleSubmitCity()
                    }
                  }}
                />
                <Button
                  onClick={handleSubmitCity}
                  disabled={!cityInput.trim() || loading || !isAuthenticated}
                  className="min-w-[100px]"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Submit"
                  )}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={getCurrentLocation}
                  disabled={locationLoading}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  {locationLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Navigation className="w-4 h-4 mr-2" />
                  )}
                  {userLocation ? "Update Location" : "Use My Location"}
                </Button>
                {userLocation && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {userLocation.city || `${userLocation.lat.toFixed(4)}, ${userLocation.lon.toFixed(4)}`}
                  </p>
                )}
              </div>
              {currentCity && (
                <p className="text-xs text-muted-foreground">
                  Currently viewing: <span className="font-medium text-foreground">{currentCity}</span>
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Time Range</CardTitle>
            </CardHeader>
            <CardContent>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
                <option value="90days">Last 90 Days</option>
              </select>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Real-time Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-muted-foreground">AQI:</span>
                  <span className={aqiColor}>{aqiStatus}</span>
                </div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-muted-foreground">Weather:</span>
                  <span className="text-xs text-green-600">Live</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Auto-refresh:</span>
                  <span className="text-xs flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    Every 6 hours
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Show message if no city submitted */}
        {!currentCity && !loading && (
          <Card className="border-border mb-8">
            <CardHeader>
              <CardTitle>Welcome to Predictions & Analytics</CardTitle>
              <CardDescription>Enter a city name above to view predictions and analytics</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Enter a city name and click Submit to see:
              </p>
              <ul className="list-disc list-inside text-sm text-muted-foreground mt-2 space-y-1">
                <li>Real-time surge probability predictions</li>
                <li>Air Quality Index (AQI) data and trends</li>
                <li>Weather conditions and forecasts</li>
                <li>Pandemic detection and analysis</li>
                <li>Staffing and supply recommendations</li>
                <li>Historical data charts and graphs</li>
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Surge Dashboard */}
        {prediction && currentCity && (
          <Card className="border-border mb-8">
            <CardHeader>
              <CardTitle>Surge Dashboard</CardTitle>
              <CardDescription>Real-time surge probability and risk assessment</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Surge Probability</span>
                    <span className={`text-2xl font-bold ${
                      prediction.surgeProbability > 70 ? "text-red-600" :
                      prediction.surgeProbability > 40 ? "text-yellow-600" : "text-green-600"
                    }`}>
                      {prediction.surgeProbability}%
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        prediction.surgeProbability > 70 ? "bg-red-600" :
                        prediction.surgeProbability > 40 ? "bg-yellow-600" : "bg-green-600"
                      }`}
                      style={{ width: `${prediction.surgeProbability}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {prediction.surgeProbability > 70 ? "🔴 High Risk - Immediate action needed" :
                     prediction.surgeProbability > 40 ? "🟡 Moderate Risk - Monitor closely" :
                     "🟢 Low Risk - Normal operations"}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Estimated Patients</div>
                  <div className="text-2xl font-bold text-primary">
                    {prediction.estimatedPatientCount || Math.round(100 * (1 + (prediction.surgeProbability / 100) * 0.5))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {prediction.activePandemics && prediction.activePandemics.length > 0 
                      ? `${prediction.activePandemics.reduce((sum, p) => sum + p.activeCases, 0)} active pandemic cases`
                      : 'Expected patient count'}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Top Contributing Factors</div>
                  <div className="space-y-1">
                    {prediction.topFactors?.slice(0, 3).map((factor, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs">
                        <span className="capitalize">{factor.feature.replace('_', ' ')}</span>
                        <span className="font-medium">{(factor.impact * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Weather Impact</div>
                  <p className="text-xs">{prediction.weatherImpact || "Normal conditions"}</p>
                </div>

                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Air Quality Impact</div>
                  <p className="text-xs">{prediction.aqiImpact || "Normal air quality"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Real-time Metrics */}
        {prediction && currentCity && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="border-border hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Air Quality (AQI)</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-3xl font-bold text-foreground">{aqi?.aqi || "N/A"}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  PM2.5: {aqi?.pm25 || "N/A"} | PM10: {aqi?.pm10 || "N/A"}
                </p>
            </CardContent>
          </Card>

          <Card className="border-border hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Temperature</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-3xl font-bold text-foreground">{weather?.temperature || "N/A"}°C</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Humidity: {weather?.humidity || "N/A"}% | Wind: {weather?.windSpeed || "N/A"} km/h
                </p>
            </CardContent>
          </Card>

          <Card className="border-border hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Staffing Needed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">
                  {prediction.staffAdvice?.doctors || 0} Docs
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {prediction.staffAdvice?.nurses || 0} Nurses | {prediction.staffAdvice?.supportStaff || 0} Support
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Charts */}
        {currentCity && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {chartData.length > 0 ? (
            <>
              <Card className="border-border">
                <CardHeader>
                  <CardTitle>Surge Probability Trend</CardTitle>
                  <CardDescription>Historical prediction data</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="date" stroke="var(--color-muted-foreground)" />
                      <YAxis stroke="var(--color-muted-foreground)" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--color-card)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "8px",
                        }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="surgeProbability" stroke="var(--color-primary)" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardHeader>
                  <CardTitle>Staffing Requirements</CardTitle>
                  <CardDescription>Doctors and nurses needed</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="date" stroke="var(--color-muted-foreground)" />
                      <YAxis stroke="var(--color-muted-foreground)" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--color-card)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "8px",
                        }}
                      />
                      <Legend />
                      <Bar dataKey="doctors" fill="var(--color-primary)" />
                      <Bar dataKey="nurses" fill="var(--color-accent)" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="border-border md:col-span-2">
              <CardHeader>
                <CardTitle>Historical Data</CardTitle>
                <CardDescription>No historical data available yet</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Historical charts will appear here once prediction data is available for {currentCity}.
                  Try generating a prediction or wait for the scheduled updates.
                </p>
              </CardContent>
            </Card>
          )}

          {/* AQI Visual Chart */}
          {aqi && (
            <Card className="border-border">
              <CardHeader>
                <CardTitle>Air Quality Index (AQI) Trend</CardTitle>
                <CardDescription>Historical AQI data for {currentCity}</CardDescription>
              </CardHeader>
              <CardContent>
                {aqiHistoryData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={aqiHistoryData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="date" stroke="var(--color-muted-foreground)" />
                      <YAxis stroke="var(--color-muted-foreground)" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--color-card)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "8px",
                        }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="aqi" stroke="#ef4444" strokeWidth={2} name="AQI" />
                      <Line type="monotone" dataKey="pm25" stroke="#f59e0b" strokeWidth={2} name="PM2.5" />
                      <Line type="monotone" dataKey="pm10" stroke="#3b82f6" strokeWidth={2} name="PM10" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-4xl font-bold mb-2" style={{ color: aqi.aqi > 150 ? '#ef4444' : aqi.aqi > 100 ? '#f59e0b' : '#10b981' }}>
                        {aqi.aqi}
                      </div>
                      <p className="text-sm text-muted-foreground">Current AQI</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        PM2.5: {aqi.pm25} | PM10: {aqi.pm10}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Weather Visual Chart */}
          {weather && (
            <Card className="border-border">
              <CardHeader>
                <CardTitle>Weather Conditions Trend</CardTitle>
                <CardDescription>Historical weather data for {currentCity}</CardDescription>
              </CardHeader>
              <CardContent>
                {weatherHistoryData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={weatherHistoryData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="date" stroke="var(--color-muted-foreground)" />
                      <YAxis yAxisId="left" stroke="var(--color-muted-foreground)" />
                      <YAxis yAxisId="right" orientation="right" stroke="var(--color-muted-foreground)" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--color-card)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "8px",
                        }}
                      />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="temperature" stroke="#ef4444" strokeWidth={2} name="Temperature (°C)" />
                      <Line yAxisId="right" type="monotone" dataKey="humidity" stroke="#3b82f6" strokeWidth={2} name="Humidity (%)" />
                      <Line yAxisId="left" type="monotone" dataKey="windSpeed" stroke="#10b981" strokeWidth={2} name="Wind Speed (km/h)" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-4xl font-bold mb-2 text-primary">
                        {weather.temperature}°C
                      </div>
                      <p className="text-sm text-muted-foreground">Current Temperature</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Humidity: {weather.humidity}% | Wind: {weather.windSpeed} km/h
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
        )}

        {/* Pandemic Data */}
        {prediction && currentCity && prediction.activePandemics && prediction.activePandemics.length > 0 && (
          <Card className="border-border mb-8 border-orange-500">
            <CardHeader>
              <CardTitle className="text-orange-600">⚠️ Active Pandemic Data</CardTitle>
              <CardDescription>Current disease outbreaks affecting patient count and medicine needs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {prediction.activePandemics.map((pandemic, idx) => (
                  <div key={idx} className="p-4 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-800">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-lg">{pandemic.diseaseName}</h4>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        pandemic.severity === 'critical' ? 'bg-red-600 text-white' :
                        pandemic.severity === 'high' ? 'bg-orange-600 text-white' :
                        pandemic.severity === 'moderate' ? 'bg-yellow-500 text-white' :
                        'bg-green-500 text-white'
                      }`}>
                        {pandemic.severity.toUpperCase()}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Active Cases:</span>
                        <div className="font-bold text-lg">{pandemic.activeCases}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">New Cases:</span>
                        <div className="font-bold text-lg text-orange-600">{pandemic.newCases}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Transmission Rate:</span>
                        <div className="font-bold text-lg">{pandemic.transmissionRate.toFixed(1)}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Impact on Patients:</span>
                        <div className="font-bold text-lg">+{Math.round(pandemic.activeCases * 0.3)}</div>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded text-sm">
                  <strong>Total Active Pandemic Cases:</strong> {prediction.activePandemics.reduce((sum, p) => sum + p.activeCases, 0)}
                  <br />
                  <strong>Estimated Additional Patients:</strong> +{Math.round(prediction.activePandemics.reduce((sum, p) => sum + p.activeCases, 0) * 0.3)}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Detailed Information */}
        {prediction && currentCity && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Card className="border-border">
          <CardHeader>
                <CardTitle>Suggested Medicines</CardTitle>
                <CardDescription>
                  {prediction.activePandemics && prediction.activePandemics.length > 0 
                    ? 'Based on weather, surge conditions, and active pandemics'
                    : 'Based on weather and surge conditions'}
                </CardDescription>
          </CardHeader>
          <CardContent>
                <div className="space-y-2">
                  {prediction.suggestedMedicines && prediction.suggestedMedicines.length > 0 ? (
                    prediction.suggestedMedicines.map((medicine, idx) => (
                      <div key={idx} className="p-2 bg-primary/10 rounded text-sm">
                        {medicine}
                </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No specific medicines suggested</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader>
                <CardTitle>Potential Diseases</CardTitle>
                <CardDescription>Based on weather and surge conditions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {prediction.suggestedDiseases && prediction.suggestedDiseases.length > 0 ? (
                    prediction.suggestedDiseases.map((disease, idx) => (
                      <div key={idx} className="p-2 bg-destructive/10 rounded text-sm">
                        {disease}
              </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No specific diseases identified</p>
                  )}
            </div>
          </CardContent>
        </Card>
          </div>
        )}

        {/* AI Agent Chat */}
        {currentCity && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <AgentChatPanel region={currentCity} timeRange={timeRange} dataType="all" />
          <DiseaseMedicineChat region={currentCity} />
        </div>
        )}
      </div>
    </div>
  )
}
