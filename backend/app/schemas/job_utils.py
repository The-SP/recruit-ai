from app.schemas.job_description import (
    EducationRequirement,
    ExperienceRequirement,
    JobRequirementsSchema,
    SkillGroup,
    SkillRequirements,
)


def build_job_requirements_schema(job_requirements) -> JobRequirementsSchema | None:
    """Builds a JobRequirementsSchema from job requirements model."""
    if not job_requirements:
        return None

    req = job_requirements
    skills = None
    if req.skills:
        skills = SkillRequirements(
            critical=[SkillGroup(**g) for g in req.skills.get("critical", [])],
            required=[SkillGroup(**g) for g in req.skills.get("required", [])],
            preferred=[SkillGroup(**g) for g in req.skills.get("preferred", [])],
        )

    return JobRequirementsSchema(
        experience=ExperienceRequirement(
            min_years=req.exp_min_years,
            max_years=req.exp_max_years,
            level=req.exp_level,
            key_skills=req.exp_key_skills,
            key_responsibilities=req.exp_key_responsibilities,
        )
        if req.exp_min_years or req.exp_level
        else None,
        education=EducationRequirement(
            min_degree=req.edu_min_degree,
            preferred_fields=req.edu_preferred_fields,
            required=req.edu_required,
        )
        if req.edu_min_degree
        else None,
        skills=skills,
    )
