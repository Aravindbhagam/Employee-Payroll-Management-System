MAX_PAGE_SIZE = 200


def parse_pagination(request, default_page_size=25, opt_in=False):
    """When opt_in is True, returns None unless the caller passes ?page=...,
    so a list endpoint keeps returning its full result set for callers that
    just need "everything" (e.g. a dropdown picker) while list-view pages
    opt in by passing page/pageSize."""
    raw_page = request.query_params.get("page")
    if opt_in and raw_page is None:
        return None

    def _to_int(value, default):
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    page = max(_to_int(raw_page, 1) or 1, 1)
    page_size = min(max(_to_int(request.query_params.get("pageSize"), default_page_size) or default_page_size, 1), MAX_PAGE_SIZE)
    return {"page": page, "pageSize": page_size, "take": page_size, "skip": (page - 1) * page_size}
