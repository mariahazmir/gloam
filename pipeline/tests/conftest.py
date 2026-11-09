from hypothesis import settings

settings.register_profile("gloam", max_examples=100, database=None, deadline=None)
settings.load_profile("gloam")
