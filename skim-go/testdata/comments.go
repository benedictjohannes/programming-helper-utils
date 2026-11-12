package comments

// Server holds state.
// Second doc line.
type Server struct {
	// Name is the server name.
	Name string // trailing name comment
	/* Port block comment */
	Port int `json:"port"`
}

// Store is an interface.
type Store interface {
	// Get fetches a value.
	Get(key string) (string, error) // trailing get
	/* Put stores one. */
	Put(key, value string) error
}

// Detached comment about nothing.

func Plain() {}

// Handle processes a request.
func Handle(
	// the id
	id int, /* inline */
	name string,
) (
	result string, // the result
	err error, // the error
) /* before body */ {
	// inline body comment
	return "", nil
} // trailing func comment

/* Block doc comment. */
func BlockDoc() {}

// Method does work.
func (s *Server) Run( /* ctx */ n int) error { return nil }

type (
	// Alpha is first.
	Alpha struct{ X int }

	// Beta is second.
	Beta = string
)

const (
	// One is one.
	One = 1
	// Two is two.
	Two = 2
)

// Version is the version.
var Version = "1"

// Single is a lone type.
type Single int
