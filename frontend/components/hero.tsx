import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function Hero() {
  return (
    <section className="px-6 pt-16 pb-8 md:pt-24 md:pb-12">
      <div className="max-w-5xl mx-auto text-center space-y-6">
        <Badge 
          variant="outline" 
          className="bg-primary/5 border-primary/20 text-primary hover:bg-primary/10 hover:text-primary px-4 py-1.5 gap-2 text-sm font-medium shadow-sm transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Next-Gen Recruiting</span>
        </Badge>
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-foreground">
          AI-Powered <span className="text-primary">Resume</span> Screening
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Stop drowning in applications. Rank candidates against your job requirements 
          with high-precision AI evaluation in just minutes.
        </p>
      </div>
    </section>
  );
}
