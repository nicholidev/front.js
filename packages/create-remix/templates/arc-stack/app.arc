@app
remix-aws-stack

@http
/*
  method any
  src server

@static

@tables
people
  pk *String  # email

password
  pk *String # user's email

notes
  pk *String  # user's email
  sk **String # noteId

arc-sessions
  _idx *String
  _ttl TTL
