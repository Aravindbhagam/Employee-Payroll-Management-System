class ParamBuilder:
    """Mirrors the JS `addParam` closure pattern used throughout the Node
    controllers: every call appends a value and returns the placeholder to
    splice into the SQL string. psycopg2 uses positional `%s` placeholders
    (not numbered like `$1`), so the placeholder is always the same token --
    only append order matters, and that order must match `params` exactly."""

    def __init__(self):
        self.params = []

    def add(self, value):
        self.params.append(value)
        return "%s"
