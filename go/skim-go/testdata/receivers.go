package testdata

type Server struct {
	Addr string
}

func (s Server) ValueReceiverMethod() string {
	return s.Addr
}

func (s *Server) PointerReceiverMethod() string {
	return s.Addr
}

func (s Server) ValueMethod() string {
	return "value"
}

type Client struct {
	Addr string
}

func (c *Client) ValueMethod() string {
	return "client"
}
