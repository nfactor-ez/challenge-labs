package main

import (
	"fmt"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	flag := "FLAG{n1nx_l1st3ns_0n_p0rt_8888}"
	hash, err := bcrypt.GenerateFromPassword([]byte(flag), bcrypt.DefaultCost)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(hash))
}
