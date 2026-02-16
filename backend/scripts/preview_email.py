from pathlib import Path

from jinja2 import Environment, FileSystemLoader

TEMPLATE_DIR = Path("app/templates/emails")
OUTPUT_DIR = Path("data/emails")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

env = Environment(loader=FileSystemLoader(TEMPLATE_DIR))

# Sample data for rendering
context = {
    "base_url": "http://localhost:8000/batch/status",
    "results_url": "http://localhost:3000/evaluation?token=wNxdEtpOXz1B7VOJ6UpqNEbAkK48D5nHXwsfyZvV_DQ",
    "token": "wNxdEtpOXz1B7VOJ6UpqNEbAkK48D5nHXwsfyZvV_DQ",
}

# Get all HTML templates (exclude base.html)
templates = [f for f in TEMPLATE_DIR.glob("*.html") if f.name != "base.html"]

for template_path in templates:
    template = env.get_template(template_path.name)
    html = template.render(**context)

    output = OUTPUT_DIR / f"preview_{template_path.name}"
    output.write_text(html)
    print(f"✓ {template_path.name} → {output}")

print(f"\nGenerated {len(templates)} previews in {OUTPUT_DIR}/")
