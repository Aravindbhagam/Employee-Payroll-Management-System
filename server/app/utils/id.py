import uuid


def new_id():
    """Generates a new primary key value. IDs are assigned application-side (not by the database)."""
    return str(uuid.uuid4())
