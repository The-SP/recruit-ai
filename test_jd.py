from pprint import pprint
from app.jd_parser import parse_job_description

# Sample job description text
jd_text = """
## Job Title: Mid-Level Python Developer
**Experience:** 3+ Years
**Location:** [Remote / Location]

### Role Summary
We are seeking a developer with **3+ years of experience** to design and build scalable backend systems. You will focus on writing clean, efficient Python code and architecting high-performance APIs.

### Key Responsibilities
* **Development:** Write reusable, testable, and efficient code in Python.
* **API Design:** Build and maintain RESTful APIs for frontend integration.
* **Database:** Optimize data storage and write complex SQL queries.
* **Quality:** Debug applications and conduct code reviews.

### Requirements
* **Core:** 3+ years of professional Python development experience.
* **Frameworks:** Strong proficiency in **Django**, **FastAPI**, or **Flask**.
* **Data:** Experience with Relational Databases (PostgreSQL/MySQL) and ORMs.
* **Tools:** Proficient with **Docker** and **Git** version control.

### Tech Stack
* **Python 3.10+**
* **FastAPI / Django**
* **PostgreSQL**
* **AWS / Docker**

"""

try:
    result = parse_job_description(jd_text)
    print(f"Is Job Description: {result.is_job_description}")
    print(f"Job Title: {result.job_title}")
    print("-" * 50)
    pprint(result)
except Exception as e:
    print(f"Error: {e}")